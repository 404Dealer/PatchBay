import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { verifyTwilioSignature } from '../_shared/twilio.ts'

serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })
  const form = await req.formData()
  const isValid = await verifyTwilioSignature(req, form, Deno.env.get('TWILIO_AUTH_TOKEN'))
  if (!isValid) return new Response('Unauthorized', { status: 401 })
  const messageSid = form.get('MessageSid')?.toString()
  const messageStatus = form.get('MessageStatus')?.toString()
  const errorCode = form.get('ErrorCode')?.toString()
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) return new Response('Server misconfigured', { status: 500 })
  const supabase = createClient(supabaseUrl, serviceKey)
  if (messageSid && messageStatus) {
    const { error } = await supabase
      .from('messages')
      .update({ status: messageStatus as any, error_code: errorCode ?? null })
      .eq('provider_message_id', messageSid)
    if (error) console.error('Status update failed', error)
  }
  return new Response('OK', { status: 200 })
})


