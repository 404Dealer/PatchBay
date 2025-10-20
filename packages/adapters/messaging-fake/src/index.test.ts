import { describe, it, expect } from 'vitest'
import { FakeMessagingProvider } from './index'

describe('FakeMessagingProvider', () => {
  it('returns sent status with providerId', async () => {
    const p = new FakeMessagingProvider()
    const r = await p.send({ tenantId: 't', leadId: 'l', to: '+1', body: 'hi' })
    expect(r.status).toBe('sent')
    expect(r.providerId).toMatch(/^fake_/)
  })
})


