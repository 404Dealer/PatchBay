export type TokenBucketKey = { tenantId: string; bucket: string }

export interface TokenBucketStore {
  read(key: TokenBucketKey): Promise<{ tokens: number; updatedAt: Date } | null>
  write(key: TokenBucketKey, value: { tokens: number; updatedAt: Date }): Promise<void>
}

// Serialize concurrent operations per key in-process to avoid race conditions with naive stores
const inProcessLocks = new Map<string, Promise<unknown>>()

export function takeToken(
  store: TokenBucketStore,
  key: TokenBucketKey,
  refillRatePerSec: number,
  capacity: number
) {
  const lockKey = `${key.tenantId}:${key.bucket}`
  const prev = inProcessLocks.get(lockKey) ?? Promise.resolve()
  let resolveResult: (value: boolean) => void
  const resultPromise = new Promise<boolean>(res => (resolveResult = res))
  const run = prev.then(async () => {
    const now = new Date()
    const current = (await store.read(key)) ?? { tokens: capacity, updatedAt: now }
    const seconds = Math.max(0, (now.getTime() - current.updatedAt.getTime()) / 1000)
    const refilled = Math.min(capacity, current.tokens + seconds * refillRatePerSec)
    if (refilled < 1) {
      await store.write(key, { tokens: refilled, updatedAt: now })
      resolveResult(false)
      return
    }
    await store.write(key, { tokens: refilled - 1, updatedAt: now })
    resolveResult(true)
  })
  inProcessLocks.set(
    lockKey,
    run.finally(() => {
      const currentLock = inProcessLocks.get(lockKey)
      if (currentLock === run) inProcessLocks.delete(lockKey)
    })
  )
  return resultPromise
}


