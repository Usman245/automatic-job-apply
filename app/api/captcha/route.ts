import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/src/lib/db'
import { resumeWorkflow } from '@/src/agents/tools/workflow'
import { runAgentLoop } from '@/src/server/agents'
import { logger } from '@/src/lib/logger'

export async function GET() {
  const pending = await prisma.captchaQueue.findMany({
    where: { status: 'pending' },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json({ pending })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { captchaId, action } = body // action: 'resolved' | 'skip'

  if (!captchaId) return NextResponse.json({ error: 'captchaId required' }, { status: 400 })

  const captcha = await prisma.captchaQueue.findUnique({ where: { id: captchaId } })
  if (!captcha) return NextResponse.json({ error: 'CAPTCHA entry not found' }, { status: 404 })

  if (action === 'resolved') {
    await prisma.captchaQueue.update({
      where: { id: captchaId },
      data: { status: 'resolved', resolvedAt: new Date() },
    })

    // Resume the workflow
    const result = await resumeWorkflow({ workflowId: captcha.workflowId })
    if (result.success) {
      runAgentLoop({ sessionId: captcha.workflowId }).catch((err) => {
        logger.error({ err: err.message }, 'resumed workflow crashed')
      })
    }

    return NextResponse.json({ resolved: true })
  }

  if (action === 'skip') {
    await prisma.captchaQueue.update({ where: { id: captchaId }, data: { status: 'expired' } })
    return NextResponse.json({ skipped: true })
  }

  return NextResponse.json({ error: 'action must be resolved | skip' }, { status: 400 })
}
