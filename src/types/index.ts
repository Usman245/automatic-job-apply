// ─── Job Types ────────────────────────────────────────────────────────────────

export type Platform =
  | 'linkedin'
  | 'indeed'
  | 'greenhouse'
  | 'lever'
  | 'workday'
  | 'workable'
  | 'wellfound'
  | 'email'
  | 'other'

export type JobStatus =
  | 'FOUND'
  | 'QUEUED'
  | 'SCORED'
  | 'READY'
  | 'APPLYING'
  | 'APPLIED'
  | 'SKIPPED'
  | 'FAILED'

export interface RawJob {
  title: string
  company: string
  location?: string
  remote: boolean
  description: string
  url: string
  applyUrl?: string
  source: Platform
  externalId?: string
  postedAt?: Date
  salaryMin?: number
  salaryMax?: number
  salaryCurrency?: string
}

export interface JobScore {
  fitScore: number
  confidence: 'low' | 'medium' | 'high'
  shouldApply: boolean
  reasons: string[]
  requiredSkills: string[]
  missingSkills: string[]
  roleType: string
  seniorityLevel: string
}

// ─── Resume Types ─────────────────────────────────────────────────────────────

export type ResumeType = 'frontend' | 'react' | 'fullstack' | 'junior_ai' | 'mern'

export interface ResumeContent {
  name: string
  email: string
  phone?: string
  location?: string
  summary: string
  skills: string[]
  experience: WorkExperience[]
  education: Education[]
  projects: Project[]
  links?: Record<string, string>
}

export interface WorkExperience {
  company: string
  title: string
  startDate: string
  endDate?: string
  bullets: string[]
  skills: string[]
}

export interface Education {
  institution: string
  degree: string
  field: string
  graduationYear: number
}

export interface Project {
  name: string
  description: string
  url?: string
  skills: string[]
  bullets: string[]
}

// ─── Application Types ────────────────────────────────────────────────────────

export type ApplicationStatus =
  | 'PENDING'
  | 'APPLYING'
  | 'APPLIED'
  | 'VIEWED'
  | 'ASSESSMENT'
  | 'INTERVIEW'
  | 'GHOSTED'
  | 'REJECTED'
  | 'OFFER'
  | 'WITHDRAWN'

export interface ScreeningAnswer {
  question: string
  answer: string
}

// ─── Workflow Types ───────────────────────────────────────────────────────────

export type WorkflowStatus = 'running' | 'paused' | 'completed' | 'failed'
export type WorkflowType =
  | 'job-discovery'
  | 'job-scoring'
  | 'resume-matching'
  | 'application'
  | 'followup'
  | 'memory-update'

export interface WorkflowData {
  jobId?: string
  applicationId?: string
  platform?: Platform
  step?: string
  retryCount?: number
  captchaId?: string
  [key: string]: unknown
}

// ─── Tool I/O ─────────────────────────────────────────────────────────────────

export interface ToolResult<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

export interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

// ─── Agent Types ──────────────────────────────────────────────────────────────

export type AgentLogLevel = 'debug' | 'info' | 'warn' | 'error'
export type AgentLogType = 'tool_call' | 'decision' | 'error' | 'retry' | 'captcha' | 'workflow'

export interface AgentSession {
  sessionId: string
  startedAt: Date
  status: 'running' | 'stopped' | 'error'
  currentTask?: string
  loopCount: number
}

// ─── Queue Job Payloads ───────────────────────────────────────────────────────

export interface JobDiscoveryPayload {
  query: string
  platform: Platform | 'all'
  maxResults?: number
}

export interface JobScoringPayload {
  jobId: string
  userId: string
}

export interface ResumeMatchPayload {
  jobId: string
  userId: string
}

export interface ApplicationPayload {
  jobId: string
  userId: string
  resumeVersionId: string
  workflowId: string
}

export interface FollowupPayload {
  applicationId: string
  userId: string
}
