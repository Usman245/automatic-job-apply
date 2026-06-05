import { NextResponse } from 'next/server'
import { getQueueStats, pauseAllQueues, resumeAllQueues } from '@/src/queues/index'
import { NextRequest } from 'next/server'

export async function GET() {
  const stats = await getQueueStats()
  return NextResponse.json({ queues: stats })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { action } = body

  if (action === 'pause') {
    await pauseAllQueues()
    return NextResponse.json({ paused: true })
  }

  if (action === 'resume') {
    await resumeAllQueues()
    return NextResponse.json({ resumed: true })
  }

  return NextResponse.json({ error: 'action must be pause | resume' }, { status: 400 })
}
