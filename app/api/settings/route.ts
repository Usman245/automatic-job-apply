import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/src/lib/db'

export async function GET() {
  const user = await prisma.user.findFirst()
  if (!user) return NextResponse.json({ settings: null })

  const settings = await prisma.settings.findUnique({ where: { userId: user.id } })
  return NextResponse.json({ settings })
}

export async function PUT(req: NextRequest) {
  const body = await req.json()
  const user = await prisma.user.findFirst()
  if (!user) return NextResponse.json({ error: 'No user found' }, { status: 400 })

  const settings = await prisma.settings.upsert({
    where: { userId: user.id },
    update: body,
    create: { userId: user.id, ...body },
  })

  return NextResponse.json({ settings })
}
