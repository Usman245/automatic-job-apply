import { z } from 'zod'
import { google } from 'googleapis'
import { getAnthropic } from '@/src/lib/anthropic'
import { prisma } from '@/src/lib/db'
import { logger } from '@/src/lib/logger'
import { getEnv } from '@/src/lib/env'
import type { ToolResult } from '@/src/types'
import * as fs from 'fs/promises'
import * as path from 'path'

// ─── Schemas ──────────────────────────────────────────────────────────────────

export const GmailApplyInput = z.object({
  jobId: z.string().cuid(),
  resumeVersionId: z.string().cuid(),
  toEmail: z.string().email(),
  subject: z.string().optional(),
})

export const GenerateCoverLetterInput = z.object({
  jobId: z.string().cuid(),
  resumeVersionId: z.string().cuid(),
  tone: z.enum(['formal', 'conversational']).default('formal'),
})

export const GenerateShortResponseInput = z.object({
  jobId: z.string().cuid(),
  prompt: z.string(),
  maxWords: z.number().int().default(150),
})

export const ScheduleFollowupInput = z.object({
  applicationId: z.string().cuid(),
  delayDays: z.number().int().min(1).default(7),
})

export const SendFollowupInput = z.object({
  followupId: z.string().cuid(),
})

// ─── Gmail Helper ─────────────────────────────────────────────────────────────

function getGmailClient() {
  const env = getEnv()
  const oauth2 = new google.auth.OAuth2(env.GMAIL_CLIENT_ID, env.GMAIL_CLIENT_SECRET)
  oauth2.setCredentials({ refresh_token: env.GMAIL_REFRESH_TOKEN })
  return google.gmail({ version: 'v1', auth: oauth2 })
}

async function sendEmail(to: string, subject: string, body: string, attachmentPath?: string) {
  const gmail = getGmailClient()
  const env = getEnv()
  const from = env.GMAIL_USER_EMAIL ?? ''

  let raw: string

  if (attachmentPath) {
    const pdfBytes = await fs.readFile(process.cwd() + '/public' + attachmentPath)
    const pdfBase64 = pdfBytes.toString('base64')
    const boundary = 'boundary_' + Date.now()

    const mime = [
      `MIME-Version: 1.0`,
      `To: ${to}`,
      `From: ${from}`,
      `Subject: ${subject}`,
      `Content-Type: multipart/mixed; boundary=${boundary}`,
      ``,
      `--${boundary}`,
      `Content-Type: text/plain; charset=utf-8`,
      ``,
      body,
      ``,
      `--${boundary}`,
      `Content-Type: application/pdf`,
      `Content-Transfer-Encoding: base64`,
      `Content-Disposition: attachment; filename="resume.pdf"`,
      ``,
      pdfBase64,
      `--${boundary}--`,
    ].join('\r\n')

    raw = Buffer.from(mime).toString('base64url')
  } else {
    const mime = [
      `MIME-Version: 1.0`,
      `To: ${to}`,
      `From: ${from}`,
      `Subject: ${subject}`,
      `Content-Type: text/plain; charset=utf-8`,
      ``,
      body,
    ].join('\r\n')
    raw = Buffer.from(mime).toString('base64url')
  }

  await gmail.users.messages.send({ userId: 'me', requestBody: { raw } })
}

// ─── Implementations ──────────────────────────────────────────────────────────

export async function generateCoverLetter(
  input: z.infer<typeof GenerateCoverLetterInput>
): Promise<ToolResult<{ coverLetter: string }>> {
  try {
    const [job, resume] = await Promise.all([
      prisma.job.findUniqueOrThrow({ where: { id: input.jobId } }),
      prisma.resumeVersion.findUniqueOrThrow({ where: { id: input.resumeVersionId } }),
    ])

    const content = resume.content as { name: string; summary: string; skills: string[]; experience: { title: string; company: string; bullets: string[] }[] }

    const message = await getAnthropic().messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      messages: [
        {
          role: 'user',
          content: `Write a ${input.tone} cover letter for:

Job: ${job.title} at ${job.company}
Required Skills: ${job.requiredSkills?.join(', ')}
Description excerpt: ${job.description.slice(0, 1000)}

Candidate:
Name: ${content.name}
Summary: ${content.summary}
Top Skills: ${content.skills.slice(0, 8).join(', ')}
Most Recent Role: ${content.experience[0]?.title ?? 'Developer'} at ${content.experience[0]?.company ?? 'Previous Company'}

Rules:
- 3 paragraphs max
- No fluff, be direct
- Highlight genuine skill matches
- Express authentic enthusiasm
- End with a clear CTA`,
        },
      ],
    })

    const coverLetter = message.content[0].type === 'text' ? message.content[0].text : ''
    return { success: true, data: { coverLetter } }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
}

export async function generateShortResponse(
  input: z.infer<typeof GenerateShortResponseInput>
): Promise<ToolResult<{ response: string }>> {
  try {
    const job = await prisma.job.findUniqueOrThrow({ where: { id: input.jobId } })

    const message = await getAnthropic().messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      messages: [
        {
          role: 'user',
          content: `Answer this application question in ${input.maxWords} words or fewer, honestly and specifically:

Question: "${input.prompt}"
Job: ${job.title} at ${job.company}

Write from the perspective of a junior-mid developer with 1-3 years experience in React/Next.js/TypeScript.`,
        },
      ],
    })

    const response = message.content[0].type === 'text' ? message.content[0].text : ''
    return { success: true, data: { response } }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
}

export async function gmailApply(
  input: z.infer<typeof GmailApplyInput>
): Promise<ToolResult<{ sent: boolean; applicationId?: string }>> {
  const log = logger.child({ tool: 'gmail_apply', jobId: input.jobId })

  try {
    const env = getEnv()
    if (!env.GMAIL_CLIENT_ID || !env.GMAIL_REFRESH_TOKEN) {
      return { success: false, error: 'Gmail credentials not configured' }
    }

    const [job, resume] = await Promise.all([
      prisma.job.findUniqueOrThrow({ where: { id: input.jobId } }),
      prisma.resumeVersion.findUniqueOrThrow({ where: { id: input.resumeVersionId } }),
    ])

    const coverLetterResult = await generateCoverLetter({
      jobId: input.jobId,
      resumeVersionId: input.resumeVersionId,
      tone: 'formal',
    })

    const body = coverLetterResult.success && coverLetterResult.data
      ? coverLetterResult.data.coverLetter
      : `Dear Hiring Manager,\n\nI am writing to express my interest in the ${job.title} position at ${job.company}.\n\nBest regards`

    const subject = input.subject ?? `Application for ${job.title} — ${job.company}`

    await sendEmail(input.toEmail, subject, body, resume.pdfPath ?? undefined)

    const application = await prisma.application.upsert({
      where: { jobId: input.jobId },
      update: { status: 'APPLIED', platform: 'email', appliedAt: new Date(), coverLetter: body },
      create: {
        userId: (await prisma.user.findFirstOrThrow()).id,
        jobId: input.jobId,
        resumeVersionId: input.resumeVersionId,
        status: 'APPLIED',
        platform: 'email',
        appliedAt: new Date(),
        coverLetter: body,
      },
    })

    await prisma.job.update({ where: { id: input.jobId }, data: { status: 'APPLIED' } })
    log.info({ applicationId: application.id, to: input.toEmail }, 'email application sent')
    return { success: true, data: { sent: true, applicationId: application.id } }
  } catch (err) {
    const message = (err as Error).message
    log.error({ err: message }, 'gmail_apply failed')
    return { success: false, error: message }
  }
}

export async function scheduleFollowup(
  input: z.infer<typeof ScheduleFollowupInput>
): Promise<ToolResult<{ followupId: string; scheduledAt: Date }>> {
  try {
    const scheduledAt = new Date(Date.now() + input.delayDays * 24 * 60 * 60 * 1000)

    const followup = await prisma.followup.create({
      data: {
        applicationId: input.applicationId,
        scheduledAt,
        status: 'PENDING',
      },
    })

    return { success: true, data: { followupId: followup.id, scheduledAt } }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
}

export async function sendFollowup(
  input: z.infer<typeof SendFollowupInput>
): Promise<ToolResult<{ sent: boolean }>> {
  const log = logger.child({ tool: 'send_followup', followupId: input.followupId })

  try {
    const env = getEnv()
    if (!env.GMAIL_CLIENT_ID) return { success: false, error: 'Gmail not configured' }

    const followup = await prisma.followup.findUniqueOrThrow({
      where: { id: input.followupId },
      include: { application: { include: { job: true } } },
    })

    const { job } = followup.application
    const daysAgo = Math.round(
      (Date.now() - (followup.application.appliedAt?.getTime() ?? Date.now())) / 86400000
    )

    const message = await getAnthropic().messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [
        {
          role: 'user',
          content: `Write a brief, professional follow-up email for a job application.

Job: ${job.title} at ${job.company}
Days since applied: ${daysAgo}
Platform: ${followup.application.platform}

Rules: 3-4 sentences max. Polite, not desperate. Restate interest and ask for status update.`,
        },
      ],
    })

    const content = message.content[0].type === 'text' ? message.content[0].text : ''

    // In a real scenario we'd have the recruiter email from the job data
    // For now just log it
    logger.info({ followupId: input.followupId, content: content.slice(0, 100) }, 'followup generated')

    await prisma.followup.update({
      where: { id: input.followupId },
      data: { status: 'SENT', sentAt: new Date(), content },
    })

    return { success: true, data: { sent: true } }
  } catch (err) {
    const message = (err as Error).message
    log.error({ err: message }, 'send_followup failed')
    return { success: false, error: message }
  }
}
