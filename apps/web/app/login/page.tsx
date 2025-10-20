
'use client'
import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

function LoginPageInner() {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const hasCheckedLink = useRef(false)

  useEffect(() => {
    const code = searchParams.get('code')
    const errorCode = searchParams.get('error_code')
    const errorDescription = searchParams.get('error_description')

    if (errorCode) {
      setError(errorDescription ?? 'Authentication failed. Please request a new link.')
      return
    }

    if (!code || hasCheckedLink.current) return

    hasCheckedLink.current = true
    const supabase = createClientComponentClient()
    setIsBusy(true)
    setMessage('Signing you in…')
    setError(null)

    supabase.auth
      .exchangeCodeForSession(code)
      .then(({ error }) => {
        if (error) {
          setError(error.message)
          setMessage(null)
          return
        }
        router.replace('/')
        router.refresh()
      })
      .finally(() => {
        setIsBusy(false)
      })
  }, [searchParams, router])

  async function signIn() {
    setError(null)
    setMessage(null)
    setIsBusy(true)
    const supabase = createClientComponentClient()
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined } })
    if (error) {
      setError(error.message)
    } else {
      setMessage('Check your email for a magic link to finish signing in.')
    }
    setIsBusy(false)
  }
  return (
    <main style={{ padding: 24 }}>
      <h1>Sign in</h1>
      <input value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" disabled={isBusy} />
      <button onClick={signIn} disabled={isBusy || !email.trim()}>Email Magic Link</button>
      {message && <p>{message}</p>}
      {error && <p style={{ color: 'red' }}>{error}</p>}
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  )
}


