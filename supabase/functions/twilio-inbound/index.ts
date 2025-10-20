// Deno Deploy (Supabase Edge Function) handler skeleton
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { verifyTwilioSignature } from '../_shared/twilio.ts'

function textResponse(body: string, status = 200) {
  return new Response(body, { status, headers: { "content-type": "text/plain" } });
}

serve(async (req) => {
  if (req.method !== 'POST') return textResponse('Method Not Allowed', 405)
  const form = await req.formData()
  const isValid = await verifyTwilioSignature(req, form, Deno.env.get('TWILIO_AUTH_TOKEN'))
  if (!isValid) return textResponse('Unauthorized', 401)
  const messagingServiceSid = form.get('MessagingServiceSid')?.toString() || undefined
  const toNumber = form.get('To')?.toString() || undefined
  const fromNumber = form.get('From')?.toString() || ''
  const body = (form.get('Body')?.toString() || '').trim()

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) return textResponse('Server misconfigured', 500)
  const supabase = createClient(supabaseUrl, serviceKey)

  // Resolve tenant by MessagingServiceSid then fallback to To number
  const { data: resolvedTenant, error: resolveErr } = await supabase
    .rpc('resolve_tenant_for_inbound', { msid: messagingServiceSid ?? null, to_e164: toNumber ?? null })
  const tenantId: string | null = resolvedTenant ?? null
  if (!tenantId) {
    console.error('Inbound: tenant not resolved', { messagingServiceSid, toNumber, resolveErr })
    // Return 200 to prevent Twilio retry loops, but we can't process it
    return textResponse('OK')
  }

  // Consent parsing
  const upper = body.toUpperCase()
  let consentAction: 'stop'|'start'|'help'|undefined
  if (/\b(STOP|STOPALL|UNSUBSCRIBE|CANCEL|END|QUIT)\b/i.test(upper)) consentAction = 'stop'
  else if (/\b(START|YES|UNSTOP)\b/i.test(upper)) consentAction = 'start'
  else if (/\b(HELP|INFO)\b/i.test(upper)) consentAction = 'help'

  // Resolve lead by matching phone
  const { data: lead } = await supabase
    .from('leads')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('phone', fromNumber)
    .maybeSingle()

  // Insert inbound message
  const { error: insertMsgErr } = await supabase.from('messages').insert({
    tenant_id: tenantId,
    lead_id: lead?.id ?? null,
    direction: 'inbound',
    channel: 'sms',
    from_number: fromNumber,
    to_number: toNumber,
    body,
    status: 'received',
  } as any)
  if (insertMsgErr) console.error('Inbound: insert message failed', insertMsgErr)

  // Enqueue owner notifications for message.received
  const { error: notifErr } = await supabase.from('notifications').insert({
    tenant_id: tenantId,
    event_type: 'message.received',
    payload: { lead_id: lead?.id ?? null, from: fromNumber, to: toNumber, body }
  } as any)
  if (notifErr) console.error('Inbound: enqueue notification failed', notifErr)

  if (consentAction) {
    // Flip consent_sms on all leads with this phone in this tenant
    const newConsent = consentAction === 'stop' ? false : true
    const { error: updErr } = await supabase
      .from('leads')
      .update({ consent_sms: newConsent })
      .eq('tenant_id', tenantId)
      .eq('phone', fromNumber)
    if (updErr) console.error('Inbound: consent update failed', updErr)

    // Enqueue confirmation reply (do not send directly)
    const confirmText = consentAction === 'stop'
      ? 'You have been opted out and will no longer receive messages. Reply START to opt back in.'
      : consentAction === 'start'
        ? 'You have been opted in. Reply STOP to opt out.'
        : 'Reply STOP to opt out. Msg&data rates may apply.'
    const { error: outboxErr } = await supabase.from('outbox').insert({
      tenant_id: tenantId,
      event_type: 'message.send',
      payload: {
        to: fromNumber,
        from: toNumber,
        body: confirmText,
        reason: `consent:${consentAction}`
      },
    } as any)
    if (outboxErr) console.error('Inbound: enqueue confirm failed', outboxErr)
  }

  return textResponse('OK')
})


