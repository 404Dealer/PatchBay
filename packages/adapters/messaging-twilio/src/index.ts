import type { MessagingProvider, MessageStatus } from '@patchbay/core'
import twilio from 'twilio'

type TwilioClient = ReturnType<typeof twilio>
type MessageCreateOptions = Parameters<TwilioClient['messages']['create']>[0]

export class TwilioMessagingProvider implements MessagingProvider {
  private client: TwilioClient
  private messagingServiceSid?: string

  constructor(args: { accountSid: string; authToken: string; messagingServiceSid?: string }) {
    this.client = twilio(args.accountSid, args.authToken)
    this.messagingServiceSid = args.messagingServiceSid
  }

  async send(input: { tenantId: string; leadId: string; to: string; body: string; from?: string }): Promise<{ providerId: string; status: MessageStatus }> {
    const params: MessageCreateOptions = {
      to: input.to,
      body: input.body,
    }
    if (input.from) {
      params.from = input.from
    } else if (this.messagingServiceSid) {
      params.messagingServiceSid = this.messagingServiceSid
    }
    const message = await this.client.messages.create(params)
    return { providerId: message.sid, status: 'queued' }
  }
}


