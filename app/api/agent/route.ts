import { NextRequest, NextResponse } from 'next/server'
import { runAgentLoop, stopAgent, getActiveSession } from '@/src/server/agents'
import { prisma } from '@/src/lib/db'
import { logger } from '@/src/lib/logger'

export async function GET() {
  const session = getActiveSession()

  const workflows = await prisma.workflowState.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
  })

  return NextResponse.json({ session, workflows })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const { action, sessionId, maxApplications, task } = body

    if (action === 'start') {
      const session = getActiveSession()
      if (session?.status === 'running') {
        return NextResponse.json({ error: 'Agent already running', session }, { status: 409 })
      }

      // Run in background — do not await
      runAgentLoop({ maxApplications, task }).catch((err) => {
        logger.error({ err: err.message }, 'agent loop crashed')
      })

      return NextResponse.json({ started: true, message: 'Agent loop started in background' })
    }

    if (action === 'stop') {
      const sid = sessionId ?? getActiveSession()?.sessionId
      if (!sid) return NextResponse.json({ error: 'No active session' }, { status: 400 })
      await stopAgent(sid)
      return NextResponse.json({ stopped: true })
    }

    if (action === 'resume') {
      if (!sessionId) return NextResponse.json({ error: 'sessionId required' }, { status: 400 })
      await prisma.workflowState.update({
        where: { workflowId: sessionId },
        data: { status: 'running', resumedAt: new Date() },
      })
      runAgentLoop({ sessionId }).catch((err) => {
        logger.error({ err: err.message }, 'resumed agent crashed')
      })
      return NextResponse.json({ resumed: true })
    }

    return NextResponse.json({ error: 'action must be start | stop | resume' }, { status: 400 })
  } catch (err) {
    logger.error({ err: (err as Error).message }, 'agent route error')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
