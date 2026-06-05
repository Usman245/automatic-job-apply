/**
 * Worker process entry point.
 * Run separately from the Next.js app: `npm run workers`
 */
import { logger } from '@/src/lib/logger'
import { jobDiscoveryWorker } from './workers/job-discovery.worker'
import { jobScoringWorker } from './workers/job-scoring.worker'
import { applicationWorker } from './workers/application.worker'
import { followupWorker } from './workers/followup.worker'
import { startCronJobs } from '@/src/lib/cron'

logger.info('Starting BullMQ workers...')

startCronJobs()

logger.info({ workers: ['job-discovery', 'job-scoring', 'application', 'followup'] }, 'All workers running')

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, closing workers')
  await Promise.all([
    jobDiscoveryWorker.close(),
    jobScoringWorker.close(),
    applicationWorker.close(),
    followupWorker.close(),
  ])
  process.exit(0)
})
