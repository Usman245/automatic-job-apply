import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/src/lib/db'

export async function GET() {
  const followups = await prisma.followup.findMany({
    include: {
      application: {
        select: {
          id: true,
          platform: true,
          job: { select: { title: true, company: true } },
        },
      },
    },
    orderBy: { scheduledAt: 'asc' },
    take: 100,
  })
  return NextResponse.json({ followups })
}
