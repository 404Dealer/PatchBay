'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

export default function RealtimeThread({ leadId, initial }: { leadId: string; initial: Array<{ id: string; direction: string; body: string }> }) {
  const [messages, setMessages] = useState(initial)
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    const supabase = createClient(url, anon)
    const channel = supabase
      .channel(`messages:${leadId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `lead_id=eq.${leadId}` }, (payload: any) => {
        if (payload.eventType === 'INSERT') {
          setMessages(prev => [...prev, payload.new as any])
        }
      })
      .subscribe()
    return () => { channel.unsubscribe() }
  }, [leadId])

  return (
    <div style={{ border: '1px solid #ddd', padding: 12, marginBottom: 12 }}>
      {messages.map(m => (
        <div key={m.id}><strong>{m.direction === 'outbound' ? 'You' : 'Lead'}:</strong> {m.body}</div>
      ))}
    </div>
  )
}


