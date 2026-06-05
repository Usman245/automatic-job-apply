import { z } from 'zod'
import { chromium, type Browser, type Page } from 'playwright'
import { getAnthropic } from '@/src/lib/anthropic'
import { prisma } from '@/src/lib/db'
import { logger } from '@/src/lib/logger'
import { getEnv } from '@/src/lib/env'
import type { ToolResult, ScreeningAnswer } from '@/src/types'

// ─── Schemas ──────────────────────────────────────────────────────────────────

export const LinkedInApplyInput = z.object({
  jobId: z.string().cuid(),
  resumeVersionId: z.string().cuid(),
  workflowId: z.string(),
})

export const IndeedApplyInput = z.object({
  jobId: z.string().cuid(),
  resumeVersionId: z.string().cuid(),
  workflowId: z.string(),
})

export const AtsApplyInput = z.object({
  jobId: z.string().cuid(),
  resumeVersionId: z.string().cuid(),
  platform: z.enum(['greenhouse', 'lever', 'workday', 'workable']),
  workflowId: z.string(),
})

export const UploadResumeInput = z.object({
  page: z.any(), // Playwright Page object passed by reference
  pdfPath: z.string(),
  selector: z.string(),
})

export const AnswerScreeningQuestionsInput = z.object({
  jobId: z.string().cuid(),
  questions: z.array(z.string()),
})

export const CaptchaDetectInput = z.object({
  workflowId: z.string(),
  url: z.string().url(),
  platform: z.string(),
})

// ─── CAPTCHA Detection ────────────────────────────────────────────────────────

export async function captchaDetect(
  input: z.infer<typeof CaptchaDetectInput>
): Promise<ToolResult<{ detected: boolean; captchaId?: string }>> {
  try {
    // Record the CAPTCHA interrupt
    const captcha = await prisma.captchaQueue.create({
      data: {
        workflowId: input.workflowId,
        url: input.url,
        platform: input.platform,
        status: 'pending',
        expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 min window
      },
    })

    await prisma.notification.create({
      data: {
        type: 'CAPTCHA_REQUIRED',
        title: 'CAPTCHA Detected',
        message: `Manual CAPTCHA resolution needed on ${input.platform}. Visit: ${input.url}`,
        data: { captchaId: captcha.id, workflowId: input.workflowId },
      },
    })

    return { success: true, data: { detected: true, captchaId: captcha.id } }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
}

// ─── Answer Screening Questions ───────────────────────────────────────────────

export async function answerScreeningQuestions(
  input: z.infer<typeof AnswerScreeningQuestionsInput>
): Promise<ToolResult<ScreeningAnswer[]>> {
  try {
    const job = await prisma.job.findUniqueOrThrow({ where: { id: input.jobId } })

    const prompt = `You are answering job application screening questions honestly.

Job: ${job.title} at ${job.company}
Questions: ${input.questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

Answer each question concisely and honestly based on this developer profile:
- 1-3 years experience with React, Next.js, TypeScript, Node.js
- Strong frontend skills, growing full-stack capabilities
- Passionate about clean code and shipping products
- Available to start in 2 weeks
- Authorized to work remotely

Output JSON array: [{"question": "...", "answer": "..."}]`

    const message = await getAnthropic().messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : '[]'
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return { success: false, error: 'No JSON array in response' }

    const answers: ScreeningAnswer[] = JSON.parse(jsonMatch[0])
    return { success: true, data: answers }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
}

// ─── LinkedIn Apply ───────────────────────────────────────────────────────────

export async function linkedinApply(
  input: z.infer<typeof LinkedInApplyInput>
): Promise<ToolResult<{ applied: boolean; applicationId?: string }>> {
  const log = logger.child({ tool: 'linkedin_apply', jobId: input.jobId })

  let browser: Browser | null = null
  try {
    const [job, resume] = await Promise.all([
      prisma.job.findUniqueOrThrow({ where: { id: input.jobId } }),
      prisma.resumeVersion.findUniqueOrThrow({ where: { id: input.resumeVersionId } }),
    ])

    const pdfPath = resume.pdfPath
    if (!pdfPath) return { success: false, error: 'Resume PDF not generated yet' }

    browser = await chromium.launch({ headless: true })
    const context = await browser.newContext()

    // Inject LinkedIn session cookie
    const env = getEnv()
    if (env.LINKEDIN_COOKIE) {
      await context.addCookies([
        { name: 'li_at', value: env.LINKEDIN_COOKIE, domain: '.linkedin.com', path: '/' },
      ])
    }

    const page = await context.newPage()

    // Navigate to job
    await page.goto(job.url, { waitUntil: 'networkidle', timeout: 30_000 })

    // Check for CAPTCHA
    const captchaPresent = await page.$('.captcha-internal, .challenge-page').then(Boolean).catch(() => false)
    if (captchaPresent) {
      await browser.close()
      const captchaResult = await captchaDetect({
        workflowId: input.workflowId,
        url: job.url,
        platform: 'linkedin',
      })
      return { success: false, error: `CAPTCHA required: ${captchaResult.data?.captchaId}` }
    }

    // Click Easy Apply button
    const applyBtn = await page.$('[data-control-name="jobdetails_topcard_inapply"], .jobs-apply-button')
    if (!applyBtn) return { success: false, error: 'Easy Apply button not found — may require full application' }

    await applyBtn.click()
    await page.waitForSelector('.jobs-easy-apply-content', { timeout: 10_000 })

    // Handle multi-step Easy Apply
    let step = 0
    while (step < 10) {
      await page.waitForTimeout(1000)

      // Fill phone if requested
      const phoneInput = await page.$('input[id*="phone"]')
      if (phoneInput) await phoneInput.fill('+1234567890')

      // Handle resume upload
      const uploadInput = await page.$('input[type="file"]')
      if (uploadInput && pdfPath) {
        await uploadInput.setInputFiles(process.cwd() + '/public' + pdfPath)
      }

      // Answer screening questions
      const questionLabels = await page.$$eval('label[for*="question"]', (els) =>
        els.map((el) => el.textContent?.trim() ?? '')
      )
      if (questionLabels.length > 0) {
        const answers = await answerScreeningQuestions({ jobId: input.jobId, questions: questionLabels })
        if (answers.success && answers.data) {
          for (const [i, answer] of answers.data.entries()) {
            const inputs = await page.$$('input[id*="question"], textarea[id*="question"]')
            if (inputs[i]) await inputs[i].fill(answer.answer)
          }
        }
      }

      // Check if submit button visible
      const submitBtn = await page.$('button[aria-label="Submit application"]')
      if (submitBtn) {
        await submitBtn.click()
        await page.waitForTimeout(2000)
        break
      }

      // Next step
      const nextBtn = await page.$('button[aria-label="Continue to next step"]')
      if (!nextBtn) break
      await nextBtn.click()
      step++
    }

    await browser.close()
    browser = null

    // Save application record
    const application = await prisma.application.upsert({
      where: { jobId: input.jobId },
      update: {
        status: 'APPLIED',
        platform: 'linkedin',
        appliedAt: new Date(),
        resumeVersionId: input.resumeVersionId,
      },
      create: {
        userId: (await prisma.job.findUniqueOrThrow({ where: { id: input.jobId } })).id,
        jobId: input.jobId,
        resumeVersionId: input.resumeVersionId,
        status: 'APPLIED',
        platform: 'linkedin',
        appliedAt: new Date(),
      },
    })

    await prisma.job.update({ where: { id: input.jobId }, data: { status: 'APPLIED' } })
    await prisma.resumeVersion.update({
      where: { id: input.resumeVersionId },
      data: { applicationCount: { increment: 1 } },
    })

    log.info({ applicationId: application.id }, 'LinkedIn application submitted')
    return { success: true, data: { applied: true, applicationId: application.id } }
  } catch (err) {
    const message = (err as Error).message
    log.error({ err: message }, 'linkedin_apply failed')
    if (browser) await browser.close().catch(() => null)
    return { success: false, error: message }
  }
}

// ─── ATS Apply (Greenhouse / Lever / Workable) ────────────────────────────────

export async function atsApply(
  input: z.infer<typeof AtsApplyInput>
): Promise<ToolResult<{ applied: boolean; applicationId?: string }>> {
  const log = logger.child({ tool: 'ats_apply', jobId: input.jobId, platform: input.platform })

  let browser: Browser | null = null
  try {
    const [job, resume] = await Promise.all([
      prisma.job.findUniqueOrThrow({ where: { id: input.jobId } }),
      prisma.resumeVersion.findUniqueOrThrow({ where: { id: input.resumeVersionId } }),
    ])

    if (!resume.pdfPath) return { success: false, error: 'Resume PDF not generated' }

    browser = await chromium.launch({ headless: true })
    const context = await browser.newContext()
    const page = await context.newPage()
    const applyUrl = job.applyUrl ?? job.url

    await page.goto(applyUrl, { waitUntil: 'networkidle', timeout: 30_000 })

    const captchaPresent = await page.$('iframe[src*="recaptcha"], .cf-challenge').then(Boolean).catch(() => false)
    if (captchaPresent) {
      await browser.close()
      const r = await captchaDetect({ workflowId: input.workflowId, url: applyUrl, platform: input.platform })
      return { success: false, error: `CAPTCHA: ${r.data?.captchaId}` }
    }

    switch (input.platform) {
      case 'greenhouse':
        await fillGreenhouseForm(page, resume.pdfPath, job)
        break
      case 'lever':
        await fillLeverForm(page, resume.pdfPath, job)
        break
      case 'workable':
        await fillWorkableForm(page, resume.pdfPath, job)
        break
    }

    await browser.close()
    browser = null

    const application = await prisma.application.upsert({
      where: { jobId: input.jobId },
      update: { status: 'APPLIED', platform: input.platform, appliedAt: new Date() },
      create: {
        userId: (await prisma.user.findFirstOrThrow()).id,
        jobId: input.jobId,
        resumeVersionId: input.resumeVersionId,
        status: 'APPLIED',
        platform: input.platform,
        appliedAt: new Date(),
      },
    })

    await prisma.job.update({ where: { id: input.jobId }, data: { status: 'APPLIED' } })
    log.info({ applicationId: application.id }, 'ATS application submitted')
    return { success: true, data: { applied: true, applicationId: application.id } }
  } catch (err) {
    const message = (err as Error).message
    log.error({ err: message }, 'ats_apply failed')
    if (browser) await browser.close().catch(() => null)
    return { success: false, error: message }
  }
}

async function fillGreenhouseForm(page: Page, pdfPath: string, job: { title: string; company: string }) {
  await page.fill('#first_name', 'FirstName')
  await page.fill('#last_name', 'LastName')
  await page.fill('#email', getEnv().GMAIL_USER_EMAIL ?? '')
  await page.fill('#phone', '+1234567890')

  const fileInput = await page.$('input[type="file"]')
  if (fileInput) await fileInput.setInputFiles(process.cwd() + '/public' + pdfPath)

  const submit = await page.$('input[type="submit"], button[type="submit"]')
  if (submit) await submit.click()
  await page.waitForTimeout(3000)
}

async function fillLeverForm(page: Page, pdfPath: string, job: { title: string; company: string }) {
  await page.fill('input[name="name"]', 'FirstName LastName')
  await page.fill('input[name="email"]', getEnv().GMAIL_USER_EMAIL ?? '')
  await page.fill('input[name="phone"]', '+1234567890')

  const fileInput = await page.$('input[type="file"]')
  if (fileInput) await fileInput.setInputFiles(process.cwd() + '/public' + pdfPath)

  const submit = await page.$('button[type="submit"]')
  if (submit) await submit.click()
  await page.waitForTimeout(3000)
}

async function fillWorkableForm(page: Page, pdfPath: string, job: { title: string; company: string }) {
  await page.fill('input[name="firstname"]', 'FirstName')
  await page.fill('input[name="lastname"]', 'LastName')
  await page.fill('input[name="email"]', getEnv().GMAIL_USER_EMAIL ?? '')

  const fileInput = await page.$('input[type="file"]')
  if (fileInput) await fileInput.setInputFiles(process.cwd() + '/public' + pdfPath)

  const submit = await page.$('button[type="submit"]')
  if (submit) await submit.click()
  await page.waitForTimeout(3000)
}
