import type { MessagingProvider, MessageStatus } from '@patchbay/core'

export class FakeMessagingProvider implements MessagingProvider {
  async send(input: { tenantId: string; leadId: string; to: string; body: string; from?: string }): Promise<{ providerId: string; status: MessageStatus }> {
    const providerId = `fake_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    return { providerId, status: 'sent' }
  }
}


