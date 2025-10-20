import { getServerComponentSupabase } from '@/lib/supabaseClient'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const supabase = getServerComponentSupabase()
  const { data: templates } = await supabase.from('templates').select('id, key, content').order('created_at', { ascending: false }).limit(20)
  const { data: creds } = await supabase.from('messaging_credentials').select('provider, messaging_service_sid').limit(1).maybeSingle()
  const { data: numbers } = await supabase.from('phone_numbers').select('e164, is_system').order('created_at', { ascending: false })
  return (
    <main style={{ padding: 24 }}>
      <h1>Settings</h1>
      <section>
        <h2>Templates</h2>
        <pre>{JSON.stringify(templates ?? [], null, 2)}</pre>
      </section>
      <section>
        <h2>Credentials</h2>
        <pre>{JSON.stringify(creds ?? null, null, 2)}</pre>
      </section>
      <section>
        <h2>Numbers</h2>
        <pre>{JSON.stringify(numbers ?? [], null, 2)}</pre>
      </section>
    </main>
  )
}


