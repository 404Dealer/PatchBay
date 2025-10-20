import { MessagingProvider } from '@patchbay/core'
import { MessagingProviderRegistry } from '@patchbay/core'
import { FakeMessagingProvider } from '@patchbay/messaging-fake'
import { TwilioMessagingProvider } from '@patchbay/messaging-twilio'
import { getRouteSupabase } from './supabaseClient'

export async function getProviderForTenant(tenantId: string): Promise<MessagingProvider> {
  const supabase = getRouteSupabase()
  const { data: creds } = await supabase
    .from('messaging_credentials')
    .select('provider, account_sid, auth_token, messaging_service_sid')
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (creds && creds.provider === 'twilio' && creds.account_sid && creds.auth_token) {
    return new TwilioMessagingProvider({ accountSid: creds.account_sid, authToken: creds.auth_token, messagingServiceSid: creds.messaging_service_sid ?? undefined })
  }
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (accountSid && authToken) {
    return new TwilioMessagingProvider({
      accountSid,
      authToken,
      messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID ?? undefined,
    })
  }
  return new FakeMessagingProvider()
}

export const ProviderRegistry = MessagingProviderRegistry


