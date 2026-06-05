'use client'

import { useEffect, useState, useCallback, useRef } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface QueueStat {
  name: string
  waiting: number
  active: number
  completed: number
  failed: number
  delayed: number
}

interface AgentSession {
  sessionId: string
  loopCount: number
  currentTask?: string
  status: string
}

interface DashboardData {
  jobsTotal: number
  appsTotal: number
  interviews: number
  offers: number
  session: AgentSession | null
  queues: QueueStat[]
}

// ─── Constants ────────────────────────────────────────────────────────────────

const QUEUE_META: Record<string, { label: string; abbr: string }> = {
  'job-discovery-queue': { label: 'Discovery',   abbr: 'DISC' },
  'job-scoring-queue':   { label: 'Scoring',     abbr: 'SCOR' },
  'resume-matching-queue': { label: 'Resume',    abbr: 'RESM' },
  'application-queue':   { label: 'Application', abbr: 'APPL' },
  'followup-queue':      { label: 'Follow-up',   abbr: 'FLUP' },
  'captcha-queue':       { label: 'CAPTCHA',     abbr: 'CAPT' },
  'memory-update-queue': { label: 'Memory',      abbr: 'MEMO' },
}

const PLACEHOLDER_QUEUES: QueueStat[] = Object.keys(QUEUE_META).map((name) => ({
  name, waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0,
}))

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toLocaleString('en-US')
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
  label, value, unit, loading, highlight = false, stagger = 0,
}: {
  label: string
  value: number
  unit: string
  loading: boolean
  highlight?: boolean
  stagger?: number
}) {
  return (
    <div
      className={`card-shimmer ${highlight ? 'card-shimmer-cyan' : ''} animate-slide-up bg-zinc-900/50 border border-zinc-800/70 rounded-sm p-5 flex flex-col justify-between`}
      style={{ animationDelay: `${stagger}ms` }}
    >
      <div className="flex items-start justify-between">
        <span className="f-data text-[9px] uppercase tracking-[0.22em] text-zinc-600">{label}</span>
        <div className={`w-1 h-1 rounded-full mt-1 ${highlight ? 'bg-cyan-400' : 'bg-zinc-700'}`} />
      </div>
      <div className="mt-4">
        <span className={`f-display block text-4xl font-extrabold leading-none tracking-tight ${
          highlight ? 'text-cyan-300 glow-cyan' : 'text-zinc-100'
        }`}>
          {loading ? <span className="text-zinc-700">—</span> : fmt(value)}
        </span>
        <span className="f-data text-[9px] text-zinc-700 mt-1.5 block uppercase tracking-wider">{unit}</span>
      </div>
    </div>
  )
}

function QueueCard({ q }: { q: QueueStat }) {
  const meta = QUEUE_META[q.name] ?? { label: q.name.replace('-queue',''), abbr: q.name.slice(0,4).toUpperCase() }
  const isActive  = q.active  > 0
  const hasFailed = q.failed  > 0
  const totalLoad = q.waiting + q.active + q.delayed

  return (
    <div className={`rounded-sm border p-3 flex flex-col gap-3 transition-all duration-500 ${
      hasFailed  ? 'border-red-900/50   bg-red-950/10'    :
      isActive   ? 'border-indigo-800/40 bg-indigo-950/10' :
                   'border-zinc-800/50   bg-zinc-900/30'
    }`}>
      <div className="flex items-center justify-between">
        <span className="f-data text-[9px] uppercase tracking-[0.2em] text-zinc-600 truncate">{meta.abbr}</span>
        {isActive && (
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
        )}
        {hasFailed && !isActive && (
          <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
        )}
      </div>

      <div className="space-y-1.5">
        <Row label="wait" value={q.waiting} color="text-zinc-400" />
        <Row label="live" value={q.active}  color={isActive ? 'text-indigo-300' : 'text-zinc-600'} />
        {hasFailed && <Row label="err"  value={q.failed}  color="text-red-400" />}
      </div>

      {/* Load bar */}
      <div className="h-px bg-zinc-800 overflow-hidden rounded-full">
        <div
          className={`h-full rounded-full transition-all duration-700 ${
            hasFailed ? 'bg-red-500' : isActive ? 'bg-indigo-500' : 'bg-zinc-700'
          }`}
          style={{ width: `${Math.min(totalLoad * 12, 100)}%` }}
        />
      </div>
    </div>
  )
}

function Row({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="f-data text-[8px] text-zinc-700 uppercase tracking-wider">{label}</span>
      <span className={`f-data text-[10px] tabular-nums ${color}`}>{value}</span>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionPending, setActionPending] = useState(false)
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const refresh = useCallback(async () => {
    try {
      const [jobsRes, appsRes, agentRes, queuesRes] = await Promise.all([
        fetch('/api/jobs?pageSize=1').then((r) => r.json()).catch(() => ({ total: 0 })),
        fetch('/api/applications?pageSize=1').then((r) => r.json()).catch(() => ({ total: 0 })),
        fetch('/api/agent').then((r) => r.json()).catch(() => ({ session: null })),
        fetch('/api/queue').then((r) => r.json()).catch(() => ({ queues: [] })),
      ])
      setData({
        jobsTotal:  jobsRes.total  ?? 0,
        appsTotal:  appsRes.total  ?? 0,
        interviews: 0,
        offers:     0,
        session:    agentRes.session ?? null,
        queues:     queuesRes.queues ?? [],
      })
      setLastSync(new Date().toLocaleTimeString('en-US', { hour12: false }))
      setTick((t) => t + 1)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    intervalRef.current = setInterval(refresh, 15_000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [refresh])

  const toggleAgent = async () => {
    setActionPending(true)
    const isRunning = data?.session?.status === 'running'
    await fetch('/api/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: isRunning ? 'stop' : 'start',
        task: isRunning ? undefined : `
          Run a job DISCOVERY AND SCORING session only.
          DO NOT call any application tools (linkedin_apply_tool, ats_apply_tool, gmail_apply_tool).
          DO NOT call schedule_followup_tool or embed_application_tool.

          Steps:
          1. retrieve_memory_tool — check what has worked before
          2. search_jobs_tool — find new jobs across all platforms
          3. deduplicate_jobs_tool — remove already-seen jobs
          4. For each new job: extract_job_details_tool, score_job_tool, embed_job_description_tool (only if fitScore >= 0.6)
          5. log_activity_tool — summarize what was found and scored

          After scoring all discovered jobs, STOP. The user will review the job list and apply manually.
        `,
      }),
    }).catch(() => null)
    await refresh()
    setActionPending(false)
  }

  const isRunning = data?.session?.status === 'running'
  const queues = data?.queues.length ? data.queues : PLACEHOLDER_QUEUES

  return (
    <div className="flex-1 grid-bg min-h-screen">

      {/* ── Top bar ────────────────────────────────────────────────── */}
      <div className="border-b border-zinc-800/50 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="f-display text-[10px] font-bold tracking-[0.35em] text-indigo-400 uppercase">
            Control Panel
          </span>
          <span className="w-px h-3 bg-zinc-700" />
          <span className="f-data text-[9px] text-zinc-700 uppercase tracking-widest">
            claude-opus-4-8 · autonomous mode
          </span>
        </div>
        <div className="flex items-center gap-2">
          {lastSync && (
            <span className="f-data text-[9px] text-zinc-700 uppercase tracking-wider">
              sync {lastSync}
            </span>
          )}
          <div className={`w-1.5 h-1.5 rounded-full ${
            isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-700'
          }`} />
        </div>
      </div>

      {/* ── Main content ───────────────────────────────────────────── */}
      <div className="px-6 py-7 space-y-8">

        {/* ── Hero ────────────────────────────────────────────────── */}
        <div className="flex items-end justify-between gap-6">
          <div className="animate-slide-up">
            <p className="f-data text-[9px] uppercase tracking-[0.3em] text-zinc-600 mb-3">
              Autonomous Job Hunter
            </p>
            <h1 className="f-display text-6xl font-extrabold tracking-tighter leading-none text-zinc-100">
              Agent
              <span className="text-indigo-400 glow-indigo">.</span>
            </h1>
            <p className="f-data text-[9px] text-zinc-700 mt-2 tracking-widest">
              REACT · FRONTEND · FULLSTACK · AI/ML
            </p>
          </div>

          {/* Status + control cluster */}
          <div className="flex items-center gap-8 animate-slide-up" style={{ animationDelay: '80ms' }}>

            {/* Status badge */}
            <div className="text-right">
              <div className="flex items-center justify-end gap-2.5 mb-1">
                <span className={`f-data text-[9px] uppercase tracking-widest font-semibold ${
                  isRunning ? 'text-emerald-400 glow-green' : 'text-zinc-600'
                }`}>
                  {loading ? '...' : isRunning ? 'Running' : 'Offline'}
                </span>
                <div className={`pulse-dot w-2.5 h-2.5 ${
                  isRunning ? 'bg-emerald-400 text-emerald-400' : 'bg-zinc-700 text-zinc-700'
                }`} />
              </div>
              {isRunning && data?.session && (
                <div className="space-y-0.5">
                  <p className="f-data text-[8px] text-zinc-700 tabular-nums">
                    LOOP {String(data.session.loopCount).padStart(4,'0')}
                  </p>
                  <p className="f-data text-[8px] text-zinc-700">
                    SID {data.session.sessionId.slice(0, 8).toUpperCase()}
                  </p>
                </div>
              )}
            </div>

            {/* Toggle button */}
            <button
              onClick={toggleAgent}
              disabled={actionPending || loading}
              className={`
                relative f-display text-xs font-bold tracking-[0.2em] uppercase
                px-7 py-3 border transition-all duration-200 rounded-sm
                ${isRunning
                  ? 'border-red-700/60 text-red-400 hover:bg-red-950/40 hover:border-red-600'
                  : 'border-indigo-700/60 text-indigo-300 hover:bg-indigo-950/40 hover:border-indigo-500'
                }
                disabled:opacity-25 disabled:cursor-not-allowed
              `}
            >
              {actionPending
                ? <span className="cursor-blink">Hold</span>
                : isRunning ? 'Stop' : 'Search Jobs'
              }
            </button>
          </div>
        </div>

        {/* ── Live task bar ───────────────────────────────────────── */}
        {isRunning && data?.session?.currentTask && (
          <div
            key={data.session.currentTask}
            className="animate-slide-up border border-emerald-900/30 bg-emerald-950/10 rounded-sm px-4 py-3 flex items-center gap-3"
          >
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <span className="f-data text-[9px] uppercase tracking-widest text-emerald-700 shrink-0">Task</span>
            <span className="f-data text-xs text-emerald-300/80 truncate cursor-blink">
              {data.session.currentTask}
            </span>
          </div>
        )}

        {/* ── Stats ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Jobs Found"    value={data?.jobsTotal  ?? 0} unit="in database" loading={loading} stagger={0} />
          <StatCard label="Applications"  value={data?.appsTotal  ?? 0} unit="sent"        loading={loading} stagger={60}  highlight />
          <StatCard label="Interviews"    value={data?.interviews ?? 0} unit="scheduled"   loading={loading} stagger={120} />
          <StatCard label="Offers"        value={data?.offers     ?? 0} unit="received"    loading={loading} stagger={180} />
        </div>

        {/* ── Queue Health ─────────────────────────────────────────── */}
        <section>
          <SectionHeader label="Queue Health" right={`${queues.length} workers`} />
          <div className="grid grid-cols-4 lg:grid-cols-7 gap-2">
            {queues.map((q) => <QueueCard key={q.name} q={q} />)}
          </div>
        </section>

        {/* ── Activity Timeline ────────────────────────────────────── */}
        <section>
          <SectionHeader label="Activity Log" right="live stream" />
          <div className="border border-zinc-800/50 rounded-sm overflow-hidden">
            {isRunning ? (
              <div className="px-4 py-6 text-center">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <div className="w-1 h-1 bg-indigo-500 rounded-full animate-pulse" />
                  <span className="f-data text-[9px] uppercase tracking-widest text-zinc-600">
                    Listening for events
                  </span>
                  <div className="w-1 h-1 bg-indigo-500 rounded-full animate-pulse" style={{ animationDelay: '0.3s' }} />
                </div>
                <p className="f-data text-[9px] text-zinc-700">
                  Logs appear in real time as the agent works
                </p>
              </div>
            ) : (
              <>
                <LogRow time="--:--:--" level="INFO"  msg="Agent initialized — awaiting start command" />
                <LogRow time="--:--:--" level="DEBUG" msg="Platform targets: LinkedIn · Indeed · Wellfound · Greenhouse" />
                <LogRow time="--:--:--" level="INFO"  msg="Resume profiles loaded: react · frontend · fullstack · ai" />
                <LogRow time="--:--:--" level="DEBUG" msg="Fit score threshold: 0.60 · Max daily applications: 20" />
                <LogRow time="--:--:--" level="INFO"  msg="Press Initialize to begin autonomous operation" last />
              </>
            )}
          </div>
        </section>

      </div>
    </div>
  )
}

// ─── Utility components ───────────────────────────────────────────────────────

function SectionHeader({ label, right }: { label: string; right?: string }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <h2 className="f-display text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-500 shrink-0">
        {label}
      </h2>
      <div className="flex-1 h-px bg-zinc-800/70" />
      {right && (
        <span className="f-data text-[8px] uppercase tracking-widest text-zinc-700 shrink-0">{right}</span>
      )}
    </div>
  )
}

const LEVEL_COLOR: Record<string, string> = {
  INFO:  'text-indigo-600',
  DEBUG: 'text-zinc-700',
  WARN:  'text-amber-600',
  ERROR: 'text-red-600',
}

function LogRow({ time, level, msg, last = false }: {
  time: string; level: string; msg: string; last?: boolean
}) {
  return (
    <div className={`flex items-center gap-4 px-4 py-2.5 hover:bg-zinc-800/20 transition-colors ${
      !last ? 'border-b border-zinc-800/40' : ''
    }`}>
      <span className="f-data text-[9px] text-zinc-700 w-14 shrink-0 tabular-nums">{time}</span>
      <span className={`f-data text-[8px] uppercase tracking-wider w-10 shrink-0 ${LEVEL_COLOR[level] ?? 'text-zinc-700'}`}>
        {level}
      </span>
      <span className="f-data text-[10px] text-zinc-500 truncate">{msg}</span>
    </div>
  )
}
