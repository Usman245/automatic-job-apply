import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/src/lib/db'
import { runApplyJob } from '@/src/server/agents'
import { logger } from '@/src/lib/logger'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const job = await prisma.job.findUnique({ where: { id } })
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

    if (job.status === 'APPLIED' || job.status === 'APPLYING') {
      return NextResponse.json({ error: 'Already applied or applying' }, { status: 409 })
    }

    const user = await prisma.user.findFirstOrThrow()

    await prisma.job.update({ where: { id }, data: { status: 'APPLYING' } })

    runApplyJob(id, user.id).catch((err) => {
      logger.error({ err: err.message, jobId: id }, 'apply job crashed')
    })

    return NextResponse.json({ queued: true })
  } catch (err) {
    logger.error({ err: (err as Error).message }, 'apply route error')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
