import { Queue } from 'bullmq'
import { logger } from '@/src/lib/logger'

function redisConnection() {
  const redisUrl = process.env.REDIS_URL
  if (!redisUrl) return { host: 'localhost', port: 6379 }
  const url = new URL(redisUrl)
  return {
    host: url.hostname,
    port: Number(url.port) || 6379,
    password: url.password || undefined,
    db: url.pathname ? Number(url.pathname.replace('/', '')) || 0 : 0,
  }
}

const defaultJobOptions = {
  removeOnComplete: { count: 200 },
  removeOnFail: { count: 100 },
}

const makeQueue = (name: string, extraDefaults = {}) =>
  new Queue(name, {
    connection: redisConnection(),
    defaultJobOptions: { ...defaultJobOptions, ...extraDefaults },
  })

// ─── Queue Definitions ────────────────────────────────────────────────────────

export const jobDiscoveryQueue   = makeQueue('job-discovery-queue',   { attempts: 3, backoff: { type: 'exponential', delay: 5000 } })
export const jobScoringQueue     = makeQueue('job-scoring-queue',     { attempts: 3, backoff: { type: 'exponential', delay: 3000 } })
export const resumeMatchingQueue = makeQueue('resume-matching-queue', { attempts: 2, backoff: { type: 'fixed',       delay: 2000 } })
export const applicationQueue    = makeQueue('application-queue',     { attempts: 2, backoff: { type: 'exponential', delay: 10000 } })
export const followupQueue       = makeQueue('followup-queue',        { attempts: 3, backoff: { type: 'exponential', delay: 5000 } })
export const captchaQueueBullMQ  = makeQueue('captcha-queue')
export const memoryUpdateQueue   = makeQueue('memory-update-queue',   { attempts: 2, backoff: { type: 'fixed',       delay: 2000 } })

export const ALL_QUEUES = [
  jobDiscoveryQueue,
  jobScoringQueue,
  resumeMatchingQueue,
  applicationQueue,
  followupQueue,
  captchaQueueBullMQ,
  memoryUpdateQueue,
]

// ─── Queue Helpers ────────────────────────────────────────────────────────────

export async function getQueueStats() {
  return Promise.all(
    ALL_QUEUES.map(async (q) => {
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        q.getWaitingCount(),
        q.getActiveCount(),
        q.getCompletedCount(),
        q.getFailedCount(),
        q.getDelayedCount(),
      ])
      return { name: q.name, waiting, active, completed, failed, delayed }
    })
  )
}

export async function pauseAllQueues() {
  await Promise.all(ALL_QUEUES.map((q) => q.pause()))
  logger.info('all queues paused')
}

export async function resumeAllQueues() {
  await Promise.all(ALL_QUEUES.map((q) => q.resume()))
  logger.info('all queues resumed')
}

export { redisConnection }
