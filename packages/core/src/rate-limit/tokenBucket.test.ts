import { describe, it, expect } from 'vitest'
import { takeToken, type TokenBucketKey, type TokenBucketStore } from './tokenBucket'

class MemoryStore implements TokenBucketStore {
  private m = new Map<string, { tokens: number; updatedAt: Date }>()
  private k(key: TokenBucketKey) { return `${key.tenantId}:${key.bucket}` }
  async read(key: TokenBucketKey) { return this.m.get(this.k(key)) ?? null }
  async write(key: TokenBucketKey, value: { tokens: number; updatedAt: Date }) { this.m.set(this.k(key), value) }
}

describe('token bucket', () => {
  it('allows up to capacity immediately then blocks', async () => {
    const store = new MemoryStore()
    const key = { tenantId: 't', bucket: 'b' }
    const results = await Promise.all(Array.from({ length: 3 }).map(() => takeToken(store, key, 0, 2)))
    expect(results.filter(Boolean).length).toBe(2)
  })
})


