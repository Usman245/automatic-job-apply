import { z } from 'zod'
import { prisma } from '@/src/lib/db'
import { logger } from '@/src/lib/logger'
import type { ToolResult } from '@/src/types'

// ─── Schemas ──────────────────────────────────────────────────────────────────

export const LogActivityInput = z.object({
  sessionId: z.string().optional(),
  level: z.enum(['debug', 'info', 'warn', 'error']),
  type: z.enum(['tool_call', 'decision', 'error', 'retry', 'captcha', 'workflow']),
  tool: z.string().optional(),
  message: z.string(),
  data: z.record(z.string(), z.unknown()).optional(),
  duration: z.number().int().optional(),
})

export const NotifyUserInput = z.object({
  type: z.string(),
  title: z.string(),
  message: z.string(),
  data: z.record(z.string(), z.unknown()).optional(),
})

// ─── Implementations ──────────────────────────────────────────────────────────

export async function logActivity(
  input: z.infer<typeof LogActivityInput>
): Promise<ToolResult<{ logged: boolean }>> {
  try {
    await prisma.agentLog.create({
      data: {
        sessionId: input.sessionId,
        level: input.level,
        type: input.type,
        tool: input.tool,
        message: input.message,
        data: input.data as never,
        duration: input.duration,
      },
    })

    // Mirror to structured logger
    const logFn = logger[input.level as 'info' | 'warn' | 'error' | 'debug'].bind(logger)
    logFn({ tool: input.tool, type: input.type }, input.message)

    return { success: true, data: { logged: true } }
  } catch (err) {
    // Never let logging failures crash the agent
    console.error('[log_activity] failed:', (err as Error).message)
    return { success: true, data: { logged: false } }
  }
}

export async function notifyUser(
  input: z.infer<typeof NotifyUserInput>
): Promise<ToolResult<{ notified: boolean; notificationId: string }>> {
  try {
    const notification = await prisma.notification.create({
      data: {
        type: input.type,
        title: input.title,
        message: input.message,
        data: input.data as never,
      },
    })

    logger.info({ notificationId: notification.id, type: input.type }, input.title)
    return { success: true, data: { notified: true, notificationId: notification.id } }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
}
