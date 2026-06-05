import { NextRequest, NextResponse } from 'next/server'
import { retrieveMemory } from '@/src/agents/tools/memory'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { query, type, limit } = body

  if (!query) return NextResponse.json({ error: 'query required' }, { status: 400 })

  const result = await retrieveMemory({ query, type, limit })
  return NextResponse.json({ result: result.data, success: result.success })
}
