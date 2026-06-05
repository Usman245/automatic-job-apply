import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/src/lib/db'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const page = Number(searchParams.get('page') ?? 1)
  const pageSize = Number(searchParams.get('pageSize') ?? 20)
  const status = searchParams.get('status') ?? undefined

  const where = status ? { status: status as never } : {}

  const [applications, total] = await Promise.all([
    prisma.application.findMany({
      where,
      include: {
        job: { select: { title: true, company: true, source: true, fitScore: true } },
        resumeVersion: { select: { name: true, type: true } },
        followups: { select: { status: true, scheduledAt: true, sentAt: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.application.count({ where }),
  ])

  return NextResponse.json({ applications, total, page, pageSize })
}

export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const { applicationId, status, data } = body

  if (!applicationId || !status) {
    return NextResponse.json({ error: 'applicationId and status required' }, { status: 400 })
  }

  const updated = await prisma.application.update({
    where: { id: applicationId },
    data: { status, ...data },
  })

  return NextResponse.json({ updated })
}
