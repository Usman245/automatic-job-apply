/**
 * Main entry point for the agent system.
 * Consumed by API routes and queue workers.
 */
export {
  runAgentLoop,
  runApplyJob,
  stopAgent,
  getActiveSession,
} from '@/src/agents/orchestrator'

export { TOOL_DEFINITIONS, executeToolCall } from '@/src/agents/tools/index'
