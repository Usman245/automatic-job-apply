import { Worker } from 'bullmq'
import { prisma } from '@/src/lib/db'
import { logger } from '@/src/lib/logger'
import { scoreJob, embedJob } from '@/src/agents/tools/job-scoring'
import { applicationQueue, redisConnection } from '../index'
import type { JobScoringPayload } from '@/src/types'

export const jobScoringWorker = new Worker<JobScoringPayload>(
  'job-scoring-queue',
  async (job) => {
    const log = logger.child({ worker: 'job-scoring', queueJobId: job.id, jobId: job.data.jobId })
    log.info('scoring job')

    const { jobId, userId } = job.data

    const scoreResult = await scoreJob({ jobId, userSkills: [], userExperience: '' })
    if (!scoreResult.success) throw new Error(scoreResult.error)

    await embedJob({ jobId }).catch((err: Error) => {
      log.warn({ err: err.message }, 'embedding failed, non-fatal')
    })

    const settings = await prisma.settings.findFirst({ where: { userId } })
    const minScore = settings?.minFitScore ?? 0.60
    const score = scoreResult.data!

    if (score.shouldApply && score.fitScore >= minScore) {
      await applicationQueue.add(
        'apply-to-job',
        { jobId, userId, workflowId: `apply-${jobId}` },
        { delay: Math.random() * 5000 }
      )
      log.info({ fitScore: score.fitScore }, 'queued for application')
    } else {
      log.info({ fitScore: score.fitScore, shouldApply: score.shouldApply }, 'job skipped')
    }

    return score
  },
  { connection: redisConnection(), concurrency: 4 }
)

jobScoringWorker.on('failed', (job, err) => logger.error({ jobId: job?.id, err: err.message }, 'job-scoring failed'))
