import { getRouteSupabase } from '@/lib/supabaseClient'

export async function POST() {
  const supabase = getRouteSupabase()
  const { data: { user } } = await (supabase as any).auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  // Ensure a default tenant exists
  let { data: tenant } = await supabase.from('tenants').select('id').limit(1).maybeSingle()
  if (!tenant) {
    const created = await supabase.from('tenants').insert({ name: 'Default Tenant' }).select('id').single()
    if (created.error || !created.data) return Response.json({ error: 'Tenant create failed' }, { status: 500 })
    tenant = created.data
  }

  // Ensure membership as owner
  await supabase.from('profiles').upsert({ id: user.id as string, display_name: user.email ?? null } as any)
  await supabase.from('memberships').upsert({ user_id: user.id as string, tenant_id: tenant.id as string, role: 'owner' } as any)

  return Response.json({ ok: true, tenantId: tenant.id })
}


