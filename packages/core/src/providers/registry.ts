import type { MessagingProvider } from '../index'

// Placeholder registry; will resolve per-tenant credentials later
export class MessagingProviderRegistry {
  constructor(private readonly resolver: (tenantId: string) => Promise<MessagingProvider>) {}

  static fromSingle(provider: MessagingProvider) {
    return new MessagingProviderRegistry(async () => provider)
  }

  async get(tenantId: string): Promise<MessagingProvider> {
    return this.resolver(tenantId)
  }
}


