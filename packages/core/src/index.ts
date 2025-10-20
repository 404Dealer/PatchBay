export type MessageStatus = 'queued' | 'sent' | 'delivered' | 'failed' | 'received'

export interface MessagingProvider {
  send(input: { tenantId: string; leadId: string; to: string; body: string; from?: string }): Promise<{
    providerId: string
    status: MessageStatus
  }>
}

export interface TemplateEngine {
  render(content: string, ctx: { lead: unknown; quote?: unknown; tenant: unknown }): string
}

export interface ProviderRegistry {
  get(tenantId: string): Promise<MessagingProvider>
}

export * from './providers/registry'
export * from './rate-limit/tokenBucket'


