import { Worker } from 'bullmq'
import { prisma } from '@/src/lib/db'
import { logger } from '@/src/lib/logger'
import { sendFollowup } from '@/src/agents/tools/communication'
import { updateApplicationStatus } from '@/src/agents/tools/workflow'
import { redisConnection } from '../index'
import type { FollowupPayload } from '@/src/types'

export const followupWorker = new Worker<FollowupPayload>(
  'followup-queue',
  async (job) => {
    const log = logger.child({ worker: 'followup', queueJobId: job.id })
    const { applicationId } = job.data

    const application = await prisma.application.findUniqueOrThrow({
      where: { id: applicationId },
      include: {
        followups: { where: { status: 'PENDING' }, orderBy: { scheduledAt: 'asc' } },
        job: true,
      },
    })

    if (['INTERVIEW', 'OFFER', 'REJECTED'].includes(application.status)) {
      return { skipped: true }
    }

    const now = new Date()
    const dueFollowup = application.followups.find((f) => f.scheduledAt <= now)
    if (!dueFollowup) return { skipped: true }

    const settings = await prisma.settings.findFirst({ where: { userId: application.userId } })
    if (!settings?.autoFollowup) {
      await prisma.notification.create({
        data: {
          type: 'FOLLOWUP_APPROVAL_NEEDED',
          title: 'Follow-up Awaiting Approval',
          message: `Follow-up for ${application.job.title} at ${application.job.company} is ready`,
          data: { followupId: dueFollowup.id, applicationId } as never,
        },
      })
      return { pending: true, followupId: dueFollowup.id }
    }

    const result = await sendFollowup({ followupId: dueFollowup.id })
    if (!result.success) throw new Error(result.error)

    const daysSince = application.appliedAt
      ? (now.getTime() - application.appliedAt.getTime()) / 86400000
      : 0

    if (daysSince > 30 && application.status === 'APPLIED') {
      await updateApplicationStatus({ applicationId, status: 'GHOSTED' })
    }

    log.info({ followupId: dueFollowup.id }, 'followup sent')
    return { sent: true, followupId: dueFollowup.id }
  },
  { connection: redisConnection(), concurrency: 2 }
)

followupWorker.on('failed', (job, err) => logger.error({ jobId: job?.id, err: err.message }, 'followup failed'))
