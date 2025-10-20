// Minimal RLS smoke test using supabase-js
// Usage: set SUPABASE_URL, SUPABASE_ANON_KEY, USER_ACCESS_TOKEN, TENANT_ID

import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL as string
const anon = process.env.SUPABASE_ANON_KEY as string
const userToken = process.env.USER_ACCESS_TOKEN as string
const tenantId = process.env.TENANT_ID as string

async function main() {
  if (!url || !anon || !userToken || !tenantId) {
    throw new Error('Missing env: SUPABASE_URL, SUPABASE_ANON_KEY, USER_ACCESS_TOKEN, TENANT_ID')
  }
  const supabase = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${userToken}` } },
  })

  // Insert a template in the tenant
  const { error: insErr } = await supabase.from('templates').insert({
    tenant_id: tenantId,
    key: 'smoke',
    content: 'ok',
  })
  if (insErr) throw insErr

  // Select should only return rows from our tenant
  const { data: rows, error: selErr } = await supabase
    .from('templates')
    .select('tenant_id, key, content')
    .order('created_at', { ascending: false })
    .limit(5)
  if (selErr) throw selErr

  if (!rows || rows.some((r) => r.tenant_id !== tenantId)) {
    throw new Error('RLS failed: leaked rows from another tenant')
  }

  console.log('RLS smoke ok', { count: rows.length })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})


