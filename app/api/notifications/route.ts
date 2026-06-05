import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/src/lib/db'

export async function GET() {
  const notifications = await prisma.notification.findMany({
    where: { read: false },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
  return NextResponse.json({ notifications })
}

export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const { id, readAll } = body

  if (readAll) {
    await prisma.notification.updateMany({ data: { read: true } })
    return NextResponse.json({ marked: 'all' })
  }

  if (id) {
    await prisma.notification.update({ where: { id }, data: { read: true } })
    return NextResponse.json({ marked: id })
  }

  return NextResponse.json({ error: 'id or readAll required' }, { status: 400 })
}
