import { Worker } from 'bullmq'
import { prisma } from '@/src/lib/db'
import { logger } from '@/src/lib/logger'
import { findMatchingResume, customizeResume, generateResumePdf } from '@/src/agents/tools/resume'
import { linkedinApply, atsApply } from '@/src/agents/tools/application'
import { gmailApply, scheduleFollowup } from '@/src/agents/tools/communication'
import { embedApplication } from '@/src/agents/tools/memory'
import { redisConnection } from '../index'
import type { ApplicationPayload } from '@/src/types'

export const applicationWorker = new Worker<ApplicationPayload>(
  'application-queue',
  async (job) => {
    const log = logger.child({ worker: 'application', queueJobId: job.id, jobId: job.data.jobId })
    log.info('starting application workflow')

    const { jobId, userId, workflowId } = job.data
    const dbJob = await prisma.job.findUniqueOrThrow({ where: { id: jobId } })

    // 1. Find best resume
    const matchResult = await findMatchingResume({ jobId, userId })
    if (!matchResult.success) throw new Error(matchResult.error)

    let resumeVersionId = matchResult.data!.resumeVersionId

    // 2. Customize if low confidence
    if (matchResult.data!.confidence === 'low') {
      const customResult = await customizeResume({ resumeVersionId, jobId, userId })
      if (customResult.success && customResult.data) resumeVersionId = customResult.data.resumeVersionId
    }

    // 3. Generate PDF if missing
    const resume = await prisma.resumeVersion.findUniqueOrThrow({ where: { id: resumeVersionId } })
    if (!resume.pdfPath) {
      const pdfResult = await generateResumePdf({ resumeVersionId })
      if (!pdfResult.success) throw new Error(pdfResult.error)
    }

    // 4. Apply
    let applied = false
    let applicationId: string | undefined

    switch (dbJob.source) {
      case 'linkedin': {
        const r = await linkedinApply({ jobId, resumeVersionId, workflowId })
        applied = r.success && (r.data?.applied ?? false)
        applicationId = r.data?.applicationId
        break
      }
      case 'greenhouse':
      case 'lever':
      case 'workable': {
        const r = await atsApply({ jobId, resumeVersionId, platform: dbJob.source as 'greenhouse', workflowId })
        applied = r.success && (r.data?.applied ?? false)
        applicationId = r.data?.applicationId
        break
      }
      default: {
        if (dbJob.applyUrl?.includes('mailto:')) {
          const email = dbJob.applyUrl.replace('mailto:', '')
          if (email) {
            const r = await gmailApply({ jobId, resumeVersionId, toEmail: email })
            applied = r.success && (r.data?.sent ?? false)
            applicationId = r.data?.applicationId
          }
        }
      }
    }

    if (applied && applicationId) {
      const settings = await prisma.settings.findFirst({ where: { userId } })
      await scheduleFollowup({ applicationId, delayDays: settings?.followupDelayDays ?? 7 })
      await embedApplication({ applicationId }).catch(() => null)
      log.info({ applicationId, platform: dbJob.source }, 'application completed')
    }

    return { applied, applicationId }
  },
  {
    connection: redisConnection(),
    concurrency: 1,
    limiter: { max: 5, duration: 60_000 },
  }
)

applicationWorker.on('completed', (job) => logger.info({ jobId: job.id }, 'application worker completed'))
applicationWorker.on('failed', (job, err) => logger.error({ jobId: job?.id, err: err.message }, 'application worker failed'))
