import Redis from 'ioredis'
import { getEnv } from './env'

const globalForRedis = globalThis as unknown as { redis: Redis | undefined }

function createRedis(): Redis {
  const client = new Redis(getEnv().REDIS_URL, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: true,
    retryStrategy(times) {
      if (times > 6) return null
      return Math.min(times * 150, 3000)
    },
  })
  client.on('error', (err) => console.error('[redis] error', err.message))
  return client
}

export const redis: Redis = new Proxy({} as Redis, {
  get(_, prop: string | symbol) {
    const client = globalForRedis.redis ?? createRedis()
    if (process.env.NODE_ENV !== 'production') globalForRedis.redis = client
    return (client as unknown as Record<string | symbol, unknown>)[prop]
  },
})
