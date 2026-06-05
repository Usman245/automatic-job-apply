import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/src/lib/db'
import { jobDiscoveryQueue } from '@/src/queues/index'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const page = Number(searchParams.get('page') ?? 1)
  const pageSize = Number(searchParams.get('pageSize') ?? 20)
  const status = searchParams.get('status') ?? undefined
  const source = searchParams.get('source') ?? undefined
  const minScore = searchParams.get('minScore') ? Number(searchParams.get('minScore')) : undefined

  const where = {
    ...(status ? { status: status as never } : {}),
    ...(source ? { source } : {}),
    ...(minScore !== undefined ? { fitScore: { gte: minScore } } : {}),
  }

  const [jobs, total] = await Promise.all([
    prisma.job.findMany({
      where,
      orderBy: { scrapedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.job.count({ where }),
  ])

  return NextResponse.json({ jobs, total, page, pageSize })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { query, platform, maxResults } = body

  if (!query) {
    return NextResponse.json({ error: 'query is required' }, { status: 400 })
  }

  const queueJob = await jobDiscoveryQueue.add('discover', {
    query,
    platform: platform ?? 'all',
    maxResults: maxResults ?? 20,
  })

  return NextResponse.json({ queued: true, jobId: queueJob.id })
}
