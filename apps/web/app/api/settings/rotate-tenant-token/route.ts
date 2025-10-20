import { getRouteSupabase } from '@/lib/supabaseClient'

export async function POST() {
  const supabase = getRouteSupabase()
  const { data: { user } } = await (supabase as any).auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: tenant } = await supabase.from('tenants').select('id').limit(1).maybeSingle()
  if (!tenant) return Response.json({ error: 'No tenant' }, { status: 400 })
  const opaque = crypto.randomUUID().replace(/-/g, '')
  await supabase.rpc('set_tenant_token', { p_tenant_id: tenant.id, p_token: opaque })
  return Response.json({ token: `${tenant.id}:${opaque}` })
}


