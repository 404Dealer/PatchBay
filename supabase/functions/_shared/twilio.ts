// Minimal Twilio signature verification for Deno
// Reference: https://www.twilio.com/docs/usage/security#validating-requests
export async function verifyTwilioSignature(req: Request, form: FormData, authToken?: string | null): Promise<boolean> {
  if (!authToken) return true
  const url = new URL(req.url)
  // Reconstruct validation string: full URL + sorted form key/value pairs
  const entries = Array.from(form.entries()).map(([k, v]) => [k, String(v)] as const)
  entries.sort(([a], [b]) => a.localeCompare(b))
  const validationString = url.toString() + entries.map(([k, v]) => k + v).join('')
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', encoder.encode(authToken), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'])
  const signatureBytes = await crypto.subtle.sign('HMAC', key, encoder.encode(validationString))
  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signatureBytes)))
  const provided = req.headers.get('x-twilio-signature') || ''
  // Constant-time compare
  return timingSafeEqual(signatureB64, provided)
}

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder()
  const ba = enc.encode(a)
  const bb = enc.encode(b)
  if (ba.length !== bb.length) return false
  let out = 0
  for (let i = 0; i < ba.length; i++) out |= ba[i] ^ bb[i]
  return out === 0
}


