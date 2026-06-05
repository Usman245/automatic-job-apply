import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/src/lib/db'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const page = Number(searchParams.get('page') ?? 1)
  const pageSize = Number(searchParams.get('pageSize') ?? 50)
  const level = searchParams.get('level') ?? undefined
  const sessionId = searchParams.get('sessionId') ?? undefined

  const where = {
    ...(level ? { level } : {}),
    ...(sessionId ? { sessionId } : {}),
  }

  const [logs, total] = await Promise.all([
    prisma.agentLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.agentLog.count({ where }),
  ])

  return NextResponse.json({ logs, total, page, pageSize })
}
