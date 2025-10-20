'use client'
import { useState, FormEvent } from 'react'

export default function SendForm({ leadId, to }: { leadId: string; to: string }) {
  const [body, setBody] = useState('')
  const [status, setStatus] = useState<string>('')
  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setStatus('Sending...')
    const res = await fetch('/api/messages/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ leadId, to, body }),
    })
    const json = await res.json()
    setStatus(res.ok ? 'Sent' : json.error || 'Error')
    if (res.ok) setBody('')
  }
  return (
    <form onSubmit={onSubmit} style={{ display: 'flex', gap: 8 }}>
      <input value={body} onChange={e => setBody(e.target.value)} placeholder="Type a message" />
      <button type="submit">Send</button>
      <span>{status}</span>
    </form>
  )
}


