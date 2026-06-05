import cron from 'node-cron'
import { jobDiscoveryQueue, followupQueue } from '@/src/queues/index'
import { prisma } from '@/src/lib/db'
import { logger } from '@/src/lib/logger'

const SEARCH_QUERIES = [
  'React Developer remote',
  'Frontend Developer remote',
  'Full Stack Developer remote',
  'Junior AI Developer remote',
  'Next.js Developer remote',
  'MERN Developer remote',
]

export function startCronJobs() {
  // Job discovery: every 4 hours
  cron.schedule('0 */4 * * *', async () => {
    logger.info('cron: starting job discovery')
    for (const query of SEARCH_QUERIES) {
      await jobDiscoveryQueue.add('discover', { query, platform: 'all', maxResults: 20 })
    }
  })

  // Follow-up check: every 6 hours
  cron.schedule('0 */6 * * *', async () => {
    logger.info('cron: checking due followups')
    const dueFollowups = await prisma.followup.findMany({
      where: {
        status: 'PENDING',
        scheduledAt: { lte: new Date() },
      },
      include: { application: { select: { userId: true } } },
      take: 50,
    })

    for (const followup of dueFollowups) {
      await followupQueue.add('send-followup', {
        applicationId: followup.applicationId,
        userId: followup.application.userId,
      })
    }

    logger.info({ count: dueFollowups.length }, 'queued followups')
  })

  // Mark ghosted: daily at midnight
  cron.schedule('0 0 * * *', async () => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const result = await prisma.application.updateMany({
      where: {
        status: 'APPLIED',
        appliedAt: { lte: thirtyDaysAgo },
      },
      data: { status: 'GHOSTED' },
    })
    logger.info({ count: result.count }, 'cron: marked applications as ghosted')
  })

  logger.info('cron jobs started')
}
