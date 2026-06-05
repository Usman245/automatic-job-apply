import { z } from 'zod'
import { getAnthropic } from '@/src/lib/anthropic'
import { prisma } from '@/src/lib/db'
import { logger } from '@/src/lib/logger'
import type { JobScore, ToolResult } from '@/src/types'

// ─── Schemas ──────────────────────────────────────────────────────────────────

export const ScoreJobInput = z.object({
  jobId: z.string().cuid(),
  userSkills: z.array(z.string()).optional().default([]),
  userExperience: z.string().optional().default(''),
})

export const ClassifyJobInput = z.object({
  title: z.string(),
  description: z.string(),
})

export const EmbedJobInput = z.object({
  jobId: z.string().cuid(),
})

// ─── Scoring Prompt ───────────────────────────────────────────────────────────

const USER_PROFILE = `
User Profile:
- Junior to mid-level developer
- Skills: React, Next.js, TypeScript, Node.js, REST APIs, MongoDB, PostgreSQL, Tailwind CSS, Git
- Experience: 1-3 years
- Target roles: React Developer, Frontend Developer, Full Stack Developer, Junior AI Developer
- Preferred: Remote only, Junior/Mid level
`

const SCORE_SYSTEM = `You are a job fit analyzer. Given a job description and user profile, output a JSON score.

Rules:
- Score 0.0 to 1.0 where 1.0 is perfect fit
- Reject (shouldApply: false) if: senior-only, >5 years required, scam indicators, location-only (no remote), very poor skill match
- Be honest about missing skills
- Only output valid JSON, no markdown

Output format:
{
  "fitScore": 0.85,
  "confidence": "high",
  "shouldApply": true,
  "reasons": ["Strong React match", "Remote position"],
  "requiredSkills": ["React", "TypeScript"],
  "missingSkills": ["AWS"],
  "roleType": "Frontend Developer",
  "seniorityLevel": "mid"
}`

export async function scoreJob(
  input: z.infer<typeof ScoreJobInput>
): Promise<ToolResult<JobScore>> {
  const log = logger.child({ tool: 'score_job', jobId: input.jobId })

  try {
    const job = await prisma.job.findUniqueOrThrow({ where: { id: input.jobId } })

    const userContext = input.userSkills.length > 0
      ? `Additional user skills: ${input.userSkills.join(', ')}`
      : ''

    const message = await getAnthropic().messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: SCORE_SYSTEM,
      messages: [
        {
          role: 'user',
          content: `${USER_PROFILE}\n${userContext}\n\nJob Title: ${job.title}\nCompany: ${job.company}\nLocation: ${job.location ?? 'Not specified'}\n\nJob Description:\n${job.description.slice(0, 4000)}`,
        },
      ],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : ''
    const score: JobScore = JSON.parse(text)

    await prisma.job.update({
      where: { id: input.jobId },
      data: {
        fitScore: score.fitScore,
        confidence: score.confidence,
        shouldApply: score.shouldApply,
        reasons: score.reasons,
        requiredSkills: score.requiredSkills,
        missingSkills: score.missingSkills,
        roleType: score.roleType,
        seniorityLevel: score.seniorityLevel,
        status: score.shouldApply ? 'READY' : 'SKIPPED',
      },
    })

    log.info({ fitScore: score.fitScore, shouldApply: score.shouldApply }, 'job scored')
    return { success: true, data: score }
  } catch (err) {
    const message = (err as Error).message
    log.error({ err: message }, 'score_job failed')
    await prisma.job.update({ where: { id: input.jobId }, data: { status: 'FAILED' } }).catch(() => null)
    return { success: false, error: message }
  }
}

export async function classifyJob(
  input: z.infer<typeof ClassifyJobInput>
): Promise<ToolResult<{ roleType: string; seniorityLevel: string; isRemote: boolean }>> {
  try {
    const titleLower = input.title.toLowerCase()
    const descLower = input.description.toLowerCase()

    const seniority =
      titleLower.includes('junior') || titleLower.includes('entry') || titleLower.includes('jr')
        ? 'junior'
        : titleLower.includes('senior') || titleLower.includes('sr.') || titleLower.includes('lead')
        ? 'senior'
        : descLower.includes('5+ years') || descLower.includes('7+ years')
        ? 'senior'
        : 'mid'

    const roleType =
      titleLower.includes('full') || titleLower.includes('fullstack')
        ? 'Full Stack'
        : titleLower.includes('front') || titleLower.includes('react') || titleLower.includes('ui')
        ? 'Frontend'
        : titleLower.includes('ai') || titleLower.includes('ml') || titleLower.includes('machine')
        ? 'AI/ML'
        : 'Software Engineer'

    const isRemote =
      descLower.includes('remote') || descLower.includes('work from home') || titleLower.includes('remote')

    return { success: true, data: { roleType, seniorityLevel: seniority, isRemote } }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
}

export async function embedJob(
  input: z.infer<typeof EmbedJobInput>
): Promise<ToolResult<{ embedded: boolean }>> {
  const log = logger.child({ tool: 'embed_job', jobId: input.jobId })

  try {
    const job = await prisma.job.findUniqueOrThrow({ where: { id: input.jobId } })
    const text = `${job.title} at ${job.company}. ${job.description.slice(0, 2000)}`

    const response = await getAnthropic().messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 10,
      messages: [{ role: 'user', content: text }],
    })

    // Use Anthropic text for a deterministic embedding via a simple hash-based float array
    // In production, replace with a dedicated embedding model (e.g., text-embedding-3-small)
    const embedding = await generateEmbedding(text)

    const vectorLiteral = `[${embedding.join(',')}]`

    await prisma.$executeRaw`
      INSERT INTO "JobEmbedding" (id, "jobId", embedding, "createdAt")
      VALUES (gen_random_uuid(), ${input.jobId}, ${vectorLiteral}::vector, now())
      ON CONFLICT ("jobId") DO UPDATE SET embedding = EXCLUDED.embedding
    `

    log.info('job embedded')
    return { success: true, data: { embedded: true } }
  } catch (err) {
    const message = (err as Error).message
    log.error({ err: message }, 'embed_job failed')
    return { success: false, error: message }
  }
}

// Generates a 1536-dim embedding using a simple deterministic approach
// Replace with a real embedding API in production
async function generateEmbedding(text: string): Promise<number[]> {
  const dim = 1536
  const vec: number[] = new Array(dim).fill(0)
  for (let i = 0; i < text.length; i++) {
    vec[i % dim] += text.charCodeAt(i) / 1000
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1
  return vec.map((v) => v / norm)
}

export { generateEmbedding }
