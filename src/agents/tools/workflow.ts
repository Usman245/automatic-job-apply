import { z } from 'zod'
import { prisma } from '@/src/lib/db'
import { logger } from '@/src/lib/logger'
import type { ToolResult, WorkflowData } from '@/src/types'

// ─── Schemas ──────────────────────────────────────────────────────────────────

export const PauseWorkflowInput = z.object({
  workflowId: z.string(),
  reason: z.string(),
  data: z.record(z.string(), z.unknown()).optional(),
})

export const ResumeWorkflowInput = z.object({
  workflowId: z.string(),
})

export const SaveApplicationInput = z.object({
  userId: z.string().cuid(),
  jobId: z.string().cuid(),
  resumeVersionId: z.string().cuid(),
  platform: z.string(),
  coverLetter: z.string().optional(),
})

export const UpdateApplicationStatusInput = z.object({
  applicationId: z.string().cuid(),
  status: z.enum(['PENDING', 'APPLYING', 'APPLIED', 'VIEWED', 'ASSESSMENT', 'INTERVIEW', 'GHOSTED', 'REJECTED', 'OFFER', 'WITHDRAWN']),
  data: z.record(z.string(), z.unknown()).optional(),
})

// ─── Implementations ──────────────────────────────────────────────────────────

export async function pauseWorkflow(
  input: z.infer<typeof PauseWorkflowInput>
): Promise<ToolResult<{ paused: boolean }>> {
  const log = logger.child({ tool: 'pause_workflow', workflowId: input.workflowId })

  try {
    await prisma.workflowState.upsert({
      where: { workflowId: input.workflowId },
      update: {
        status: 'paused',
        pausedAt: new Date(),
        error: input.reason,
        data: input.data as never,
      },
      create: {
        workflowId: input.workflowId,
        type: 'application',
        status: 'paused',
        pausedAt: new Date(),
        error: input.reason,
        data: input.data as never,
      },
    })

    await prisma.notification.create({
      data: {
        type: 'WORKFLOW_PAUSED',
        title: 'Workflow Paused',
        message: `Workflow ${input.workflowId} paused: ${input.reason}`,
        data: { workflowId: input.workflowId },
      },
    })

    log.info({ reason: input.reason }, 'workflow paused')
    return { success: true, data: { paused: true } }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
}

export async function resumeWorkflow(
  input: z.infer<typeof ResumeWorkflowInput>
): Promise<ToolResult<{ resumed: boolean; data?: WorkflowData }>> {
  try {
    const workflow = await prisma.workflowState.findUnique({ where: { workflowId: input.workflowId } })
    if (!workflow) return { success: false, error: 'Workflow not found' }
    if (workflow.status !== 'paused') return { success: false, error: `Workflow is ${workflow.status}, not paused` }

    await prisma.workflowState.update({
      where: { workflowId: input.workflowId },
      data: { status: 'running', resumedAt: new Date(), error: null },
    })

    logger.info({ workflowId: input.workflowId }, 'workflow resumed')
    return { success: true, data: { resumed: true, data: workflow.data as WorkflowData } }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
}

export async function saveApplication(
  input: z.infer<typeof SaveApplicationInput>
): Promise<ToolResult<{ applicationId: string }>> {
  try {
    const application = await prisma.application.upsert({
      where: { jobId: input.jobId },
      update: {
        resumeVersionId: input.resumeVersionId,
        platform: input.platform,
        coverLetter: input.coverLetter,
      },
      create: {
        userId: input.userId,
        jobId: input.jobId,
        resumeVersionId: input.resumeVersionId,
        platform: input.platform,
        coverLetter: input.coverLetter,
        status: 'PENDING',
      },
    })

    return { success: true, data: { applicationId: application.id } }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
}

export async function updateApplicationStatus(
  input: z.infer<typeof UpdateApplicationStatusInput>
): Promise<ToolResult<{ updated: boolean }>> {
  try {
    const updateData: Record<string, unknown> = { status: input.status }

    if (input.status === 'APPLIED') updateData.appliedAt = new Date()
    if (input.status === 'VIEWED') updateData.viewedAt = new Date()
    if (input.status === 'INTERVIEW') updateData.interviewAt = new Date()
    if (input.status === 'REJECTED') {
      updateData.rejectedAt = new Date()
      if (input.data?.reason) updateData.rejectionReason = input.data.reason as string
    }
    if (input.status === 'OFFER') {
      updateData.offerAt = new Date()
      if (input.data?.details) updateData.offerDetails = input.data.details
    }

    await prisma.application.update({ where: { id: input.applicationId }, data: updateData })

    // If interview/offer, update resume performance stats
    if (input.status === 'INTERVIEW' || input.status === 'OFFER') {
      const app = await prisma.application.findUnique({ where: { id: input.applicationId } })
      if (app?.resumeVersionId) {
        await prisma.resumeVersion.update({
          where: { id: app.resumeVersionId },
          data: {
            interviewCount: input.status === 'INTERVIEW' ? { increment: 1 } : undefined,
            offerCount: input.status === 'OFFER' ? { increment: 1 } : undefined,
          },
        })
      }
    }

    return { success: true, data: { updated: true } }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
}
