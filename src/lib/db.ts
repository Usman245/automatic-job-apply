import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined }

function createPrisma(): PrismaClient {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL is not set')
  const adapter = new PrismaPg({ connectionString })
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })
}

// Lazy getter — PrismaClient is not created at module import time,
// only on first actual use. This prevents build-time failures.
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_, prop: string | symbol) {
    const client = globalForPrisma.prisma ?? createPrisma()
    if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = client
    return (client as unknown as Record<string | symbol, unknown>)[prop]
  },
})
