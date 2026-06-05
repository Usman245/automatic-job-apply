import { z } from 'zod'
import { prisma } from '@/src/lib/db'
import { logger } from '@/src/lib/logger'
import { generateEmbedding } from './job-scoring'
import type { ToolResult } from '@/src/types'

// ─── Schemas ──────────────────────────────────────────────────────────────────

export const EmbedApplicationInput = z.object({
  applicationId: z.string().cuid(),
})

export const RetrieveMemoryInput = z.object({
  query: z.string().min(1),
  type: z.enum(['jobs', 'resumes', 'applications', 'all']).default('all'),
  limit: z.number().int().min(1).max(20).default(5),
})

// ─── Implementations ──────────────────────────────────────────────────────────

export async function embedApplication(
  input: z.infer<typeof EmbedApplicationInput>
): Promise<ToolResult<{ embedded: boolean }>> {
  const log = logger.child({ tool: 'embed_application', id: input.applicationId })

  try {
    const app = await prisma.application.findUniqueOrThrow({
      where: { id: input.applicationId },
      include: { job: true, resumeVersion: true },
    })

    const text = [
      `Job: ${app.job.title} at ${app.job.company}`,
      `Platform: ${app.platform}`,
      `Status: ${app.status}`,
      `Skills required: ${app.job.requiredSkills?.join(', ')}`,
      `Resume type: ${app.resumeVersion?.type ?? 'unknown'}`,
    ].join('. ')

    const embedding = await generateEmbedding(text)
    const vectorLiteral = `[${embedding.join(',')}]`

    await prisma.$executeRaw`
      INSERT INTO "ApplicationEmbedding" (id, "applicationId", embedding, "createdAt")
      VALUES (gen_random_uuid(), ${input.applicationId}, ${vectorLiteral}::vector, now())
      ON CONFLICT ("applicationId") DO UPDATE SET embedding = EXCLUDED.embedding
    `

    log.info('application embedded')
    return { success: true, data: { embedded: true } }
  } catch (err) {
    const message = (err as Error).message
    log.error({ err: message }, 'embed_application failed')
    return { success: false, error: message }
  }
}

export async function retrieveMemory(
  input: z.infer<typeof RetrieveMemoryInput>
): Promise<ToolResult<{
  jobs: Array<{ id: string; title: string; company: string; similarity: number }>
  resumes: Array<{ id: string; name: string; type: string; similarity: number }>
  applications: Array<{ id: string; status: string; platform: string; similarity: number }>
  insights: string
}>> {
  const log = logger.child({ tool: 'retrieve_memory', query: input.query })

  try {
    const embedding = await generateEmbedding(input.query)
    const vectorLiteral = `[${embedding.join(',')}]`
    const limit = input.limit

    type JobRow = { id: string; title: string; company: string; similarity: number }
    type ResumeRow = { id: string; name: string; type: string; similarity: number }
    type AppRow = { id: string; status: string; platform: string; similarity: number }

    const [jobs, resumes, applications] = await Promise.all([
      input.type === 'resumes' ? Promise.resolve([] as JobRow[]) :
      prisma.$queryRaw<JobRow[]>`
        SELECT j.id, j.title, j.company,
               1 - (je.embedding <=> ${vectorLiteral}::vector) AS similarity
        FROM "JobEmbedding" je
        JOIN "Job" j ON j.id = je."jobId"
        ORDER BY je.embedding <=> ${vectorLiteral}::vector
        LIMIT ${limit}
      `,

      input.type === 'jobs' ? Promise.resolve([] as ResumeRow[]) :
      prisma.$queryRaw<ResumeRow[]>`
        SELECT rv.id, rv.name, rv.type,
               1 - (re.embedding <=> ${vectorLiteral}::vector) AS similarity
        FROM "ResumeEmbedding" re
        JOIN "ResumeVersion" rv ON rv.id = re."resumeVersionId"
        WHERE rv."isActive" = true
        ORDER BY re.embedding <=> ${vectorLiteral}::vector
        LIMIT ${limit}
      `,

      input.type === 'jobs' || input.type === 'resumes' ? Promise.resolve([] as AppRow[]) :
      prisma.$queryRaw<AppRow[]>`
        SELECT a.id, a.status, a.platform,
               1 - (ae.embedding <=> ${vectorLiteral}::vector) AS similarity
        FROM "ApplicationEmbedding" ae
        JOIN "Application" a ON a.id = ae."applicationId"
        ORDER BY ae.embedding <=> ${vectorLiteral}::vector
        LIMIT ${limit}
      `,
    ])

    // Synthesize insights from memory
    const successfulApps = (applications as AppRow[]).filter(
      (a) => a.status === 'INTERVIEW' || a.status === 'OFFER'
    )

    const insights = successfulApps.length > 0
      ? `Found ${successfulApps.length} successful applications matching this query. Top resume match: ${(resumes as ResumeRow[])[0]?.name ?? 'N/A'}`
      : `No directly successful patterns found. Top job match: ${(jobs as JobRow[])[0]?.title ?? 'N/A'}`

    log.info({ jobCount: (jobs as JobRow[]).length, resumeCount: (resumes as ResumeRow[]).length }, 'memory retrieved')
    return {
      success: true,
      data: {
        jobs: jobs as JobRow[],
        resumes: resumes as ResumeRow[],
        applications: applications as AppRow[],
        insights,
      },
    }
  } catch (err) {
    const message = (err as Error).message
    log.error({ err: message }, 'retrieve_memory failed')
    return { success: false, error: message }
  }
}
