import { Worker } from 'bullmq'
import { prisma } from '@/src/lib/db'
import { logger } from '@/src/lib/logger'
import { searchJobs, extractJobDetails, deduplicateJob } from '@/src/agents/tools/job-discovery'
import { jobScoringQueue, redisConnection } from '../index'
import type { JobDiscoveryPayload } from '@/src/types'

export const jobDiscoveryWorker = new Worker<JobDiscoveryPayload>(
  'job-discovery-queue',
  async (job) => {
    const log = logger.child({ worker: 'job-discovery', jobId: job.id, query: job.data.query })
    log.info('starting job discovery')

    const { query, platform, maxResults } = job.data

    const searchResult = await searchJobs({
      query,
      platform: platform as 'all',
      maxResults: maxResults ?? 20,
      remoteOnly: true,
    })

    if (!searchResult.success || !searchResult.data) {
      throw new Error(searchResult.error ?? 'Search failed')
    }

    log.info({ count: searchResult.data.length }, 'raw jobs found')
    let saved = 0
    let skipped = 0

    for (const rawJob of searchResult.data) {
      try {
        const dedup = await deduplicateJob({ url: rawJob.url, title: rawJob.title, company: rawJob.company })
        if (dedup.data?.isDuplicate) { skipped++; continue }

        const details = await extractJobDetails({ url: rawJob.url, platform: rawJob.source as 'linkedin' })
        const jobData = details.success && details.data ? details.data : rawJob

        if (!jobData.remote && !jobData.location?.toLowerCase().includes('remote')) { skipped++; continue }

        const savedJob = await prisma.job.create({
          data: {
            title: jobData.title,
            company: jobData.company,
            location: jobData.location,
            remote: jobData.remote,
            description: jobData.description || rawJob.description,
            url: jobData.url,
            applyUrl: jobData.applyUrl,
            source: jobData.source,
            externalId: rawJob.externalId,
            postedAt: rawJob.postedAt,
            salaryMin: rawJob.salaryMin,
            salaryMax: rawJob.salaryMax,
            salaryCurrency: rawJob.salaryCurrency,
            status: 'QUEUED',
          },
        })

        const user = await prisma.user.findFirst()
        if (user) {
          await jobScoringQueue.add('score-job', { jobId: savedJob.id, userId: user.id })
        }

        saved++
      } catch (err) {
        log.warn({ url: rawJob.url, err: (err as Error).message }, 'failed to save job, continuing')
      }
    }

    log.info({ saved, skipped }, 'job discovery completed')
    return { saved, skipped }
  },
  { connection: redisConnection(), concurrency: 2 }
)

jobDiscoveryWorker.on('completed', (job) => logger.info({ jobId: job.id }, 'job-discovery completed'))
jobDiscoveryWorker.on('failed', (job, err) => logger.error({ jobId: job?.id, err: err.message }, 'job-discovery failed'))
