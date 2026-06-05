import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/src/lib/db'
import { generateResumePdf } from '@/src/agents/tools/resume'

export async function GET() {
  const resumes = await prisma.resumeVersion.findMany({
    where: { isActive: true },
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { applications: true } },
    },
  })

  return NextResponse.json({ resumes })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { name, type, content, userId } = body

  if (!name || !type || !content) {
    return NextResponse.json({ error: 'name, type, and content required' }, { status: 400 })
  }

  const user = userId
    ? await prisma.user.findUnique({ where: { id: userId } })
    : await prisma.user.findFirst()

  if (!user) return NextResponse.json({ error: 'No user found' }, { status: 400 })

  const resume = await prisma.resumeVersion.create({
    data: { userId: user.id, name, type, content, version: 1 },
  })

  // Auto-generate PDF
  const pdfResult = await generateResumePdf({ resumeVersionId: resume.id })

  return NextResponse.json({ resume, pdfPath: pdfResult.data?.pdfPath })
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  await prisma.resumeVersion.update({ where: { id }, data: { isActive: false } })
  return NextResponse.json({ deleted: true })
}
