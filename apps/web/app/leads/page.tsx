import Link from 'next/link'
import { getServerComponentSupabase } from '@/lib/supabaseClient'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export default async function LeadsPage() {
  const supabase = getServerComponentSupabase()
  const { data: leads } = await supabase.from('leads').select('id, first_name, last_name, phone, created_at').order('created_at', { ascending: false }).limit(50)
  return (
    <main style={{ padding: 24 }}>
      <h1>Leads</h1>
      <ul>
        {(leads ?? []).map(l => (
          <li key={l.id}>
            <Link href={`/leads/${l.id}`}>{l.first_name} {l.last_name} — {l.phone}</Link>
          </li>
        ))}
      </ul>
    </main>
  )
}


