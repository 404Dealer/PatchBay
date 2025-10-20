import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })
  // Authenticate via OUTBOX_FN_TOKEN
  const authz = req.headers.get('authorization') || ''
  const token = authz.replace(/^Bearer\s+/i, '')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) return new Response('Server misconfigured', { status: 500 })
  const supabase = createClient(supabaseUrl, serviceKey)
  // Validate worker token via Vault
  const { data: valid, error: vaultErr } = await supabase.rpc('verify_worker_token', { in_token: token })
  if (vaultErr || !valid) return new Response('Unauthorized', { status: 401 })

  // Fetch due events (limit small for now)
  const { data: due, error } = await supabase
    .from('outbox')
    .select('*')
    .is('processed_at', null)
    .lte('next_attempt_at', new Date().toISOString())
    .order('next_attempt_at', { ascending: true })
    .limit(10)
  if (error) return new Response('DB error', { status: 500 })

  // Process basic events: message.send marks processed
  let processed = 0
  for (const row of due ?? []) {
    if (row.event_type === 'message.send') {
      // Resolve tenant creds
      const { data: creds } = await supabase
        .from('messaging_credentials')
        .select('provider, account_sid, auth_token, messaging_service_sid')
        .eq('tenant_id', row.tenant_id)
        .maybeSingle()
      let status: 'queued' | 'sent' = 'sent'
      let providerId: string | null = null
      try {
        const tenantAccountSid = creds?.provider === 'twilio' ? creds.account_sid : null
        const tenantAuthToken = creds?.provider === 'twilio' ? creds.auth_token : null
        const tenantMessagingSid = creds?.provider === 'twilio' ? creds.messaging_service_sid : null

        const envAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID') || null
        const envAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN') || null
        const envMessagingSid = Deno.env.get('TWILIO_MESSAGING_SERVICE_SID') || null
        const envFrom = Deno.env.get('TWILIO_FROM_E164') || null

        const selectAccountSid = tenantAccountSid ?? envAccountSid
        const selectAuthToken = tenantAuthToken ?? envAuthToken
        const selectMessagingSid = tenantMessagingSid ?? envMessagingSid
        const selectFrom = row.payload?.from ?? envFrom

        if (selectAccountSid && selectAuthToken) {
          const form = new URLSearchParams()
          form.set('To', row.payload?.to ?? '')
          if (selectFrom) form.set('From', selectFrom)
          if (selectMessagingSid) form.set('MessagingServiceSid', selectMessagingSid)
          form.set('Body', row.payload?.body ?? '')
          const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${selectAccountSid}/Messages.json`, {
            method: 'POST',
            headers: {
              'authorization': 'Basic ' + btoa(`${selectAccountSid}:${selectAuthToken}`),
              'content-type': 'application/x-www-form-urlencoded'
            },
            body: form
          })
          const json = await resp.json()
          providerId = json.sid || null
          status = 'queued'
        } else {
          // Fake
          providerId = `fake_${Date.now()}`
          status = 'sent'
        }
      } catch (e) {
        console.error('Send failed', e)
      }
      await supabase.from('messages').insert({
        tenant_id: row.tenant_id,
        lead_id: row.payload?.lead_id ?? null,
        direction: 'outbound',
        channel: 'sms',
        to_number: row.payload?.to ?? null,
        from_number: row.payload?.from ?? null,
        body: row.payload?.body ?? null,
        provider_message_id: providerId,
        status
      } as any)
      await supabase.from('outbox').update({ processed_at: new Date().toISOString() }).eq('id', row.id)
      processed++
      continue
    }
    if (row.event_type === 'quote.created') {
      // Render template (fallback if missing)
      const quoteId = row.payload?.quote_id
      const leadId = row.payload?.lead_id
      const { data: lead } = await supabase.from('leads').select('first_name, last_name, phone').eq('id', leadId).maybeSingle()
      const { data: tmpl } = await supabase.from('templates').select('content').eq('tenant_id', row.tenant_id).eq('key', 'quote_sms').maybeSingle()
      const body = tmpl?.content
        ?.replace(/\{\{first_name\}\}/g, lead?.first_name ?? '')
        ?.replace(/\{\{last_name\}\}/g, lead?.last_name ?? '')
        ?? 'You have a new quote.'
      // Enqueue message.send to the lead's phone
      if (lead?.phone) {
        await supabase.from('outbox').insert({
          tenant_id: row.tenant_id,
          event_type: 'message.send',
          payload: { lead_id: leadId, to: lead.phone, body }
        } as any)
      }
      await supabase.from('outbox').update({ processed_at: new Date().toISOString() }).eq('id', row.id)
      processed++
      continue
    }
    // Notifications processing
    if (row.event_type === 'notification.dispatch') {
      // Find matching rules and enqueue message.send per rule
      const rules = await supabase.from('notification_rules').select('channel, target, use_business_number').eq('tenant_id', row.tenant_id).eq('event_type', row.payload?.event_type ?? '')
      // For SMS, enqueue message.send
      for (const r of (rules.data ?? [])) {
        if (r.channel === 'sms') {
          await supabase.from('outbox').insert({
            tenant_id: row.tenant_id,
            event_type: 'message.send',
            payload: { to: r.target, from: row.payload?.from ?? null, body: row.payload?.body ?? '[Notification]' }
          } as any)
        }
      }
      await supabase.from('outbox').update({ processed_at: new Date().toISOString() }).eq('id', row.id)
      processed++
      continue
    }
    await supabase.from('outbox').update({ processed_at: new Date().toISOString() }).eq('id', row.id)
    processed++
  }

  // Process notifications queue (convert to message.send events per rules)
  const { data: notifs, error: notifErr } = await supabase
    .from('notifications')
    .select('*')
    .is('processed_at', null)
    .lte('next_attempt_at', new Date().toISOString())
    .order('next_attempt_at', { ascending: true })
    .limit(10)
  if (!notifErr) {
    for (const n of notifs ?? []) {
      const rules = await supabase
        .from('notification_rules')
        .select('channel, target, use_business_number')
        .eq('tenant_id', n.tenant_id)
        .eq('event_type', n.event_type)
      for (const r of rules.data ?? []) {
        if (r.channel === 'sms') {
          await supabase.from('outbox').insert({
            tenant_id: n.tenant_id,
            event_type: 'message.send',
            payload: {
              to: r.target,
              from: n.payload?.from ?? null,
              body: n.payload?.body ?? '[Notification]'
            }
          } as any)
        }
      }
      await supabase.from('notifications').update({ processed_at: new Date().toISOString() }).eq('id', n.id)
      processed++
    }
  }
  return new Response(JSON.stringify({ processed }), { status: 200, headers: { 'content-type': 'application/json' } })
})


