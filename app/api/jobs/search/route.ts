import { NextRequest, NextResponse } from 'next/server'
import { searchJobs, SearchJobsInput } from '@/src/agents/tools/job-discovery'
import { prisma } from '@/src/lib/db'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { query, platform = 'linkedin' } = body

  if (!query?.trim()) {
    return NextResponse.json({ error: 'query is required' }, { status: 400 })
  }

  const result = await searchJobs(
    SearchJobsInput.parse({ query, platform, maxResults: 20, remoteOnly: true })
  )

  if (!result.success || !result.data) {
    return NextResponse.json({ error: result.error ?? 'Search failed' }, { status: 500 })
  }

  const saved = []
  for (const raw of result.data) {
    if (!raw.url || !raw.title || !raw.company) continue
    try {
      const job = await prisma.job.upsert({
        where: { url: raw.url },
        update: {},
        create: {
          title: raw.title,
          company: raw.company,
          location: raw.location ?? null,
          remote: raw.remote,
          description: raw.description || '',
          url: raw.url,
          applyUrl: raw.applyUrl ?? raw.url,
          source: raw.source,
        },
      })
      saved.push(job)
    } catch {
      // skip on constraint error (duplicate)
    }
  }

  return NextResponse.json({ jobs: saved, total: saved.length, scraped: result.data.length })
}
