import { getServerComponentSupabase } from '@/lib/supabaseClient'
import SendForm from './send-form'
import RealtimeThread from './realtime-thread'

export default async function LeadDetail({ params }: any) {
  const resolved = typeof params?.then === 'function' ? await params : params
  const supabase = getServerComponentSupabase()
  const { data: lead } = await supabase.from('leads').select('id, first_name, last_name, phone').eq('id', resolved.id).maybeSingle()
  const { data: messages } = await supabase.from('messages').select('id, direction, body, created_at').eq('lead_id', resolved.id).order('created_at', { ascending: true })
  return (
    <main style={{ padding: 24 }}>
      <h1>{lead?.first_name} {lead?.last_name}</h1>
      <p>{lead?.phone}</p>
      <RealtimeThread leadId={resolved.id} initial={(messages ?? []) as any} />
      {lead && <SendForm leadId={lead.id} to={lead.phone ?? ''} />}
    </main>
  )
}


