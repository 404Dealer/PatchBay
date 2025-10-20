import { z } from 'zod'
import { getRouteSupabase } from '@/lib/supabaseClient'
import { getProviderForTenant } from '@/lib/providerRegistry'

const SendSchema = z.object({
  leadId: z.string().uuid(),
  to: z.string(),
  body: z.string().min(1),
})

export async function POST(req: Request) {
  const json = await req.json().catch(() => ({}))
  const parsed = SendSchema.safeParse(json)
  if (!parsed.success) return Response.json({ error: 'Invalid body' }, { status: 400 })

  const supabase = getRouteSupabase()
  // For now in single-tenant mode, fetch the first tenant
  const { data: tenant } = await supabase.from('tenants').select('id').limit(1).maybeSingle()
  if (!tenant) return Response.json({ error: 'No tenant' }, { status: 400 })

  // Check consent
  const { data: lead } = await supabase.from('leads').select('id, consent_sms, phone').eq('id', parsed.data.leadId).maybeSingle()
  if (!lead) return Response.json({ error: 'Lead not found' }, { status: 404 })
  if (lead.consent_sms === false) return Response.json({ error: 'No consent' }, { status: 409 })

  // Rate limit: token bucket (10 msgs/minute example)
  const { data: allowed } = await supabase.rpc('take_token', { p_tenant_id: tenant.id, p_bucket: 'send_sms', p_capacity: 10, p_refill_per_sec: 10 / 60.0 })
  if (!allowed) return Response.json({ error: 'Rate limited' }, { status: 429 })

  // Provider: Twilio when creds present, else Fake
  const provider = await getProviderForTenant(tenant.id)
  const result = await provider.send({ tenantId: tenant.id, leadId: lead.id, to: parsed.data.to, body: parsed.data.body })

  await supabase.from('messages').insert({
    tenant_id: tenant.id,
    lead_id: lead.id,
    direction: 'outbound',
    channel: 'sms',
    to_number: parsed.data.to,
    body: parsed.data.body,
    provider_message_id: result.providerId,
    status: result.status,
  } as any)

  return Response.json({ ok: true, providerId: result.providerId })
}


