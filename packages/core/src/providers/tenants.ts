export type TenantMessagingCreds = {
  provider: 'twilio' | 'fake'
  accountSid?: string
  authToken?: string
  messagingServiceSid?: string
}


