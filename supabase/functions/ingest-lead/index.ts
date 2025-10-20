import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return new Response('Bad Request', { status: 400 })
  const token = body.tenant_token as string | undefined
  const lead = body.lead as any
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) return new Response('Server misconfigured', { status: 500 })
  const supabase = createClient(supabaseUrl, serviceKey)
  const { data: tenantId } = await supabase.rpc('verify_ingest_token', { in_token: token ?? null })
  if (!tenantId) return new Response('Unauthorized', { status: 401 })
  const { error } = await supabase.from('leads').insert({
    tenant_id: tenantId,
    first_name: lead?.first_name ?? null,
    last_name: lead?.last_name ?? null,
    phone: lead?.phone ?? null,
    email: lead?.email ?? null,
    properties: lead?.properties ?? {},
  } as any)
  if (error) return new Response('DB error', { status: 500 })
  await supabase.from('notifications').insert({
    tenant_id: tenantId,
    event_type: 'lead.created',
    payload: {
      body: `New lead: ${(lead?.first_name ?? '').trim()} ${(lead?.last_name ?? '').trim()} — ${lead?.phone ?? lead?.email ?? ''}`.trim(),
    }
  } as any)
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } })
})


