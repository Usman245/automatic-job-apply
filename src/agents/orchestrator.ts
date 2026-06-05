import type Anthropic from "@anthropic-ai/sdk";
import { v4 as uuidv4 } from "uuid";
import { getAnthropic } from "@/src/lib/anthropic";
import { logger } from "@/src/lib/logger";
import { prisma } from "@/src/lib/db";
import { TOOL_DEFINITIONS, executeToolCall } from "./tools/index";
import type { AgentSession } from "@/src/types";

// ─── System Prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an autonomous job application agent. Your goal is to continuously find, evaluate, and apply to remote software development jobs on behalf of the user.

TARGET ROLES (in priority order):
1. React Developer (remote)
2. Frontend Developer (remote)
3. Full Stack Developer (remote)
4. Junior AI Developer (remote)
5. MERN Developer (remote)
6. Next.js Developer (remote)

YOUR OPERATING PRINCIPLES:
- You NEVER directly interact with websites — you ONLY call tools
- You ONLY call tools that exist in your tool list
- You make decisions based on tool results, never assume
- You always log important decisions with log_activity_tool
- You always handle errors gracefully and retry when sensible
- You NEVER apply to senior-only roles (>3 years experience required)
- You NEVER fabricate skills or experience in resumes
- You NEVER apply to suspicious or scam-like jobs
- When CAPTCHA is detected, ALWAYS call captcha_detect_tool and then pause_workflow_tool
- After applying, ALWAYS schedule a follow-up with schedule_followup_tool

STANDARD JOB APPLICATION WORKFLOW:
1. search_jobs_tool → get raw job listings
2. deduplicate_jobs_tool → skip already-seen jobs
3. extract_job_details_tool → get full description
4. score_job_tool → analyze fit (skip if fitScore < 0.6)
5. embed_job_description_tool → store for memory
6. find_matching_resume_tool → select best resume
7. customize_resume_tool → tailor if confidence is "low"
8. generate_resume_pdf_tool → ensure PDF exists
9. Apply using appropriate tool (linkedin_apply_tool, ats_apply_tool, or gmail_apply_tool)
10. schedule_followup_tool → schedule 7-day follow-up
11. embed_application_tool → store in memory for learning

MEMORY USAGE:
- Before starting each job search session, call retrieve_memory_tool with relevant query
- Use memory to pick the best resume type based on past performance
- Learn from patterns: which resumes convert, which platforms work best

RATE LIMITS:
- Maximum 20 applications per session
- Always log your reasoning for skipping or applying to a job
- Pause between batches to avoid rate limiting

Always be honest, reliable, and systematic. Prefer deterministic workflows over improvisation.`;

// ─── Orchestrator ─────────────────────────────────────────────────────────────

const MAX_TOOL_ROUNDS = 100;
const MAX_RETRIES = 3;

let _activeSession: AgentSession | null = null;

export function getActiveSession(): AgentSession | null {
  return _activeSession;
}

export async function runAgentLoop(options: {
  sessionId?: string;
  task?: string;
  maxApplications?: number;
}): Promise<void> {
  const sessionId = options.sessionId ?? uuidv4();
  const log = logger.child({ sessionId });

  _activeSession = {
    sessionId,
    startedAt: new Date(),
    status: "running",
    loopCount: 0,
  };

  // Persist workflow state
  await prisma.workflowState.upsert({
    where: { workflowId: sessionId },
    update: { status: "running", resumedAt: new Date() },
    create: {
      workflowId: sessionId,
      type: "job-discovery",
      status: "running",
      data: { maxApplications: options.maxApplications ?? 20 },
    },
  });

  const user = await prisma.user.findFirstOrThrow();
  const settings = await prisma.settings.findUnique({
    where: { userId: user.id },
  });

  const initialTask =
    options.task ??
    `
    Run a full autonomous job search and application session.
    User ID: ${user.id}
    Max applications this session: ${options.maxApplications ?? settings?.maxDailyApplications ?? 20}
    Min fit score to apply: ${settings?.minFitScore ?? 0.6}
    Target roles: ${settings?.targetRoles?.join(", ") ?? "React Developer, Frontend Developer, Full Stack Developer"}

    Start by checking memory for successful patterns, then search across all platforms.
    Apply to every qualifying job you find.
  `;

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: initialTask },
  ];

  log.info({ task: initialTask.slice(0, 100) }, "agent loop started");

  let round = 0;
  let applicationsThisSession = 0;
  const maxApps =
    options.maxApplications ?? settings?.maxDailyApplications ?? 20;

  try {
    while (round < MAX_TOOL_ROUNDS) {
      // Check if workflow was paused externally
      const workflowState = await prisma.workflowState.findUnique({
        where: { workflowId: sessionId },
      });
      if (workflowState?.status === "paused") {
        log.info("workflow paused externally, stopping loop");
        break;
      }

      if (applicationsThisSession >= maxApps) {
        log.info(
          { applicationsThisSession },
          "daily application limit reached",
        );
        messages.push({
          role: "user",
          content: `You have reached the daily application limit of ${maxApps}. Wrap up gracefully, log a summary, and stop.`,
        });
      }

      // Call Claude with tools
      const response = await callClaudeWithRetry(messages, sessionId);

      if (!response) {
        log.error("claude response failed after retries");
        break;
      }

      _activeSession!.loopCount = round;
      messages.push({ role: "assistant", content: response.content });

      // Process tool calls
      if (response.stop_reason === "tool_use") {
        const toolResults: Anthropic.ToolResultBlockParam[] = [];

        for (const block of response.content) {
          if (block.type !== "tool_use") continue;

          const toolStart = Date.now();
          log.info(
            {
              tool: block.name,
              input: JSON.stringify(block.input).slice(0, 200),
            },
            "executing tool",
          );

          let result: unknown;
          try {
            result = await executeToolCall(
              block.name,
              block.input as Record<string, unknown>,
            );

            // Track application count
            if (
              block.name === "linkedin_apply_tool" ||
              block.name === "ats_apply_tool" ||
              block.name === "gmail_apply_tool"
            ) {
              const r = result as { success: boolean };
              if (r.success) applicationsThisSession++;
            }
          } catch (err) {
            result = { success: false, error: (err as Error).message };
            log.error(
              { tool: block.name, err: (err as Error).message },
              "tool execution error",
            );
          }

          const duration = Date.now() - toolStart;

          // Always log tool calls to audit trail
          await prisma.agentLog
            .create({
              data: {
                sessionId,
                level: "info",
                type: "tool_call",
                tool: block.name,
                message: `Tool ${block.name} executed`,
                data: { input: block.input, result } as never,
                duration,
              },
            })
            .catch(() => null);

          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify(result),
          });
        }

        messages.push({ role: "user", content: toolResults });
      } else {
        // No more tool calls — agent has finished
        const finalText = response.content
          .filter((b) => b.type === "text")
          .map((b) => (b as Anthropic.TextBlock).text)
          .join("\n");

        log.info(
          { finalText: finalText.slice(0, 300), round },
          "agent loop completed",
        );
        break;
      }

      round++;
    }

    if (round >= MAX_TOOL_ROUNDS) {
      log.warn({ round }, "hit max tool rounds limit");
    }

    await prisma.workflowState.update({
      where: { workflowId: sessionId },
      data: {
        status: "completed",
        completedAt: new Date(),
        data: { applicationsThisSession, rounds: round },
      },
    });

    _activeSession!.status = "stopped";
  } catch (err) {
    const message = (err as Error).message;
    log.error({ err: message }, "agent loop crashed");

    await prisma.workflowState
      .update({
        where: { workflowId: sessionId },
        data: { status: "failed", error: message },
      })
      .catch(() => null);

    _activeSession!.status = "error";
    throw err;
  }
}

async function callClaudeWithRetry(
  messages: Anthropic.MessageParam[],
  sessionId: string,
  attempt = 0,
): Promise<Anthropic.Message | null> {
  try {
    return await getAnthropic().messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: TOOL_DEFINITIONS,
      messages,
    });
  } catch (err) {
    const message = (err as Error).message;
    logger.warn({ sessionId, attempt, err: message }, "claude call failed");

    if (
      attempt < MAX_RETRIES &&
      (message.includes("overloaded") ||
        message.includes("529") ||
        message.includes("rate"))
    ) {
      const delay = Math.pow(2, attempt) * 2000;
      await new Promise((r) => setTimeout(r, delay));
      return callClaudeWithRetry(messages, sessionId, attempt + 1);
    }

    return null;
  }
}

// ─── Single-job Apply ─────────────────────────────────────────────────────────

export async function runApplyJob(
  jobId: string,
  userId: string,
): Promise<void> {
  const sessionId = `apply-${jobId.slice(0, 8)}-${uuidv4().slice(0, 6)}`;
  const log = logger.child({ sessionId, jobId });

  const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });

  const task = `
    Apply to ONE specific job only. Do not search for other jobs.

    Job ID: ${jobId}
    Job: ${job.title} at ${job.company}
    Source: ${job.source}
    User ID: ${userId}
    Workflow ID: ${sessionId}

    Steps:
    1. find_matching_resume_tool with jobId="${jobId}"
    2. customize_resume_tool if confidence is "low"
    3. generate_resume_pdf_tool
    4. Apply using the correct tool:
       - source is "linkedin" → linkedin_apply_tool
       - source is "greenhouse", "lever", "workday", or "workable" → ats_apply_tool
       - otherwise → gmail_apply_tool
    5. schedule_followup_tool
    6. embed_application_tool

    Complete all steps and then stop. Do not do anything else.
  `;

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: task }];
  log.info(
    { title: job.title, company: job.company },
    "single-job apply started",
  );

  let round = 0;
  while (round < 20) {
    const response = await callClaudeWithRetry(messages, sessionId);
    if (!response) break;

    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason !== "tool_use") break;

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      let result: unknown;
      try {
        result = await executeToolCall(
          block.name,
          block.input as Record<string, unknown>,
        );
      } catch (err) {
        result = { success: false, error: (err as Error).message };
        log.error(
          { tool: block.name, err: (err as Error).message },
          "tool error in apply job",
        );
      }
      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: JSON.stringify(result),
      });
    }
    messages.push({ role: "user", content: toolResults });
    round++;
  }

  log.info({ rounds: round }, "single-job apply finished");
}

export async function stopAgent(sessionId: string): Promise<void> {
  await prisma.workflowState.update({
    where: { workflowId: sessionId },
    data: { status: "paused", pausedAt: new Date() },
  });
  if (_activeSession?.sessionId === sessionId) {
    _activeSession.status = "stopped";
  }
}
