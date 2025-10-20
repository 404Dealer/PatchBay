import { getRouteSupabase } from '@/lib/supabaseClient'

export async function GET() {
  const supabase = getRouteSupabase()
  const { count: outboxCount } = await supabase.from('outbox').select('*', { count: 'exact', head: true }).is('processed_at', null)
  const { count: notifCount } = await supabase.from('notifications').select('*', { count: 'exact', head: true }).is('processed_at', null)
  const payload = { status: 'ok', queues: { outbox: outboxCount ?? 0, notifications: notifCount ?? 0 }, time: new Date().toISOString() }
  return Response.json(payload)
}


