import { z } from 'zod'
import { chromium } from 'playwright'
import { prisma } from '@/src/lib/db'
import { logger } from '@/src/lib/logger'
import type { RawJob, Platform, ToolResult } from '@/src/types'

// ─── Schemas ──────────────────────────────────────────────────────────────────

export const SearchJobsInput = z.object({
  query: z.string().min(1),
  platform: z.enum(['linkedin', 'indeed', 'greenhouse', 'lever', 'workable', 'wellfound', 'all']).default('all'),
  maxResults: z.number().int().min(1).max(50).default(20),
  remoteOnly: z.boolean().default(true),
})

export const ExtractJobDetailsInput = z.object({
  url: z.string().url(),
  platform: z.enum(['linkedin', 'indeed', 'greenhouse', 'lever', 'workable', 'wellfound', 'other']),
  rawHtml: z.string().optional(),
})

export const DeduplicateJobInput = z.object({
  url: z.string().url(),
  title: z.string(),
  company: z.string(),
})

// ─── Implementations ──────────────────────────────────────────────────────────

export async function searchJobs(
  input: z.infer<typeof SearchJobsInput>
): Promise<ToolResult<RawJob[]>> {
  const log = logger.child({ tool: 'search_jobs', ...input })
  const jobs: RawJob[] = []

  try {
    const platforms: Platform[] =
      input.platform === 'all'
        ? ['linkedin', 'indeed', 'wellfound', 'greenhouse', 'lever', 'workable']
        : [input.platform as Platform]

    for (const platform of platforms) {
      try {
        const found = await scrapeJobPlatform(platform, input.query, input.maxResults, input.remoteOnly)
        jobs.push(...found)
        log.info({ platform, count: found.length }, 'scraped jobs')
      } catch (err) {
        log.warn({ platform, err: (err as Error).message }, 'platform scrape failed, continuing')
      }
    }

    return { success: true, data: jobs }
  } catch (err) {
    const message = (err as Error).message
    log.error({ err: message }, 'search_jobs failed')
    return { success: false, error: message }
  }
}

async function scrapeJobPlatform(
  platform: Platform,
  query: string,
  max: number,
  remoteOnly: boolean
): Promise<RawJob[]> {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36',
  })
  const page = await context.newPage()

  try {
    const jobs: RawJob[] = []

    switch (platform) {
      case 'linkedin': {
        const remote = remoteOnly ? '&f_WT=2' : ''
        const url = `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(query)}&f_JT=F${remote}&f_E=1,2`
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 })
        await page.waitForSelector('.jobs-search__results-list li', { timeout: 15_000 }).catch(() => null)

        const cards = await page.$$('.jobs-search__results-list li')
        for (const card of cards.slice(0, max)) {
          const title = await card.$eval('h3', (el) => el.textContent?.trim() ?? '').catch(() => '')
          const company = await card.$eval('h4', (el) => el.textContent?.trim() ?? '').catch(() => '')
          const href = await card.$eval('a', (el) => (el as HTMLAnchorElement).href).catch(() => '')
          if (title && company && href) {
            jobs.push({ title, company, remote: remoteOnly, description: '', url: href, source: 'linkedin' })
          }
        }
        break
      }

      case 'indeed': {
        const remote = remoteOnly ? '&remotejob=032b3046-06a3-4876-8dfd-474eb5e7ed11' : ''
        const url = `https://indeed.com/jobs?q=${encodeURIComponent(query)}&l=Remote${remote}`
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 })
        await page.waitForSelector('.job_seen_beacon', { timeout: 15_000 }).catch(() => null)

        const cards = await page.$$('.job_seen_beacon')
        for (const card of cards.slice(0, max)) {
          const title = await card.$eval('[data-testid="jobTitle"]', (el) => el.textContent?.trim() ?? '').catch(() => '')
          const company = await card.$eval('[data-testid="company-name"]', (el) => el.textContent?.trim() ?? '').catch(() => '')
          const href = await card.$eval('[data-testid="jobTitle"] a', (el) => (el as HTMLAnchorElement).href).catch(() => '')
          if (title && company && href) {
            jobs.push({ title, company, remote: remoteOnly, description: '', url: href, source: 'indeed' })
          }
        }
        break
      }

      case 'wellfound': {
        const url = `https://wellfound.com/jobs?q=${encodeURIComponent(query)}&remote=true`
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 })
        await page.waitForSelector('[data-test="StartupResult"]', { timeout: 15_000 }).catch(() => null)

        const cards = await page.$$('[data-test="StartupResult"]')
        for (const card of cards.slice(0, max)) {
          const title = await card.$eval('h2', (el) => el.textContent?.trim() ?? '').catch(() => '')
          const company = await card.$eval('[data-test="startup-name"]', (el) => el.textContent?.trim() ?? '').catch(() => '')
          const href = await card.$eval('a', (el) => (el as HTMLAnchorElement).href).catch(() => '')
          if (title && company && href) {
            jobs.push({ title, company, remote: true, description: '', url: `https://wellfound.com${href}`, source: 'wellfound' })
          }
        }
        break
      }

      default:
        logger.warn({ platform }, 'scraper not yet implemented for platform')
    }

    return jobs
  } finally {
    await browser.close()
  }
}

export async function extractJobDetails(
  input: z.infer<typeof ExtractJobDetailsInput>
): Promise<ToolResult<RawJob>> {
  const log = logger.child({ tool: 'extract_job_details', url: input.url })

  try {
    const browser = await chromium.launch({ headless: true })
    const context = await browser.newContext()
    const page = await context.newPage()

    await page.goto(input.url, { waitUntil: 'networkidle', timeout: 30_000 })

    let title = ''
    let company = ''
    let description = ''
    let location = ''
    let applyUrl = ''

    switch (input.platform) {
      case 'linkedin': {
        title = await page.$eval('.top-card-layout__title', (el) => el.textContent?.trim() ?? '').catch(() => '')
        company = await page.$eval('.top-card-layout__company-name', (el) => el.textContent?.trim() ?? '').catch(() => '')
        description = await page.$eval('.show-more-less-html__markup', (el) => el.textContent?.trim() ?? '').catch(() => '')
        location = await page.$eval('.top-card-layout__bullet', (el) => el.textContent?.trim() ?? '').catch(() => '')
        applyUrl = input.url
        break
      }
      case 'indeed': {
        title = await page.$eval('[data-testid="jobsearch-JobInfoHeader-title"]', (el) => el.textContent?.trim() ?? '').catch(() => '')
        company = await page.$eval('[data-testid="inlineHeader-companyName"]', (el) => el.textContent?.trim() ?? '').catch(() => '')
        description = await page.$eval('#jobDescriptionText', (el) => el.textContent?.trim() ?? '').catch(() => '')
        location = await page.$eval('[data-testid="job-location"]', (el) => el.textContent?.trim() ?? '').catch(() => '')
        break
      }
      case 'greenhouse': {
        title = await page.$eval('#header h1', (el) => el.textContent?.trim() ?? '').catch(() => '')
        company = await page.$eval('#header .company-name', (el) => el.textContent?.trim() ?? '').catch(() => '')
        description = await page.$eval('#content', (el) => el.textContent?.trim() ?? '').catch(() => '')
        applyUrl = input.url
        break
      }
      case 'lever': {
        title = await page.$eval('.posting-headline h2', (el) => el.textContent?.trim() ?? '').catch(() => '')
        company = await page.$eval('.posting-headline .posting-categories', (el) => el.textContent?.trim() ?? '').catch(() => '')
        description = await page.$eval('.posting-description', (el) => el.textContent?.trim() ?? '').catch(() => '')
        applyUrl = await page.$eval('a.postings-btn', (el) => (el as HTMLAnchorElement).href).catch(() => '')
        break
      }
      default: {
        title = await page.title()
        description = await page.$eval('body', (el) => el.textContent?.trim().slice(0, 5000) ?? '').catch(() => '')
      }
    }

    await browser.close()

    const remote = location.toLowerCase().includes('remote') ||
      description.toLowerCase().includes('remote') ||
      description.toLowerCase().includes('work from home')

    const job: RawJob = {
      title,
      company,
      location,
      remote,
      description,
      url: input.url,
      applyUrl: applyUrl || input.url,
      source: input.platform,
    }

    log.info({ title, company }, 'extracted job details')
    return { success: true, data: job }
  } catch (err) {
    const message = (err as Error).message
    log.error({ err: message }, 'extract_job_details failed')
    return { success: false, error: message }
  }
}

export async function deduplicateJob(
  input: z.infer<typeof DeduplicateJobInput>
): Promise<ToolResult<{ isDuplicate: boolean; existingId?: string }>> {
  try {
    const existing = await prisma.job.findUnique({ where: { url: input.url } })
    if (existing) {
      return { success: true, data: { isDuplicate: true, existingId: existing.id } }
    }

    // Fuzzy dedup: same title + company within 7 days
    const recent = await prisma.job.findFirst({
      where: {
        title: { equals: input.title, mode: 'insensitive' },
        company: { equals: input.company, mode: 'insensitive' },
        scrapedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
    })

    return { success: true, data: { isDuplicate: !!recent, existingId: recent?.id } }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
}
