'use client'

import { useEffect, useState } from 'react'

interface Application {
  id: string
  status: string
  platform?: string
  appliedAt?: string
  job: { title: string; company: string; source: string; fitScore?: number }
  resumeVersion?: { name: string; type: string }
  followups: { status: string; scheduledAt: string }[]
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  PENDING:    { label: 'Pending',    color: 'text-zinc-400 bg-zinc-800' },
  APPLYING:   { label: 'Applying',   color: 'text-yellow-400 bg-yellow-900/30' },
  APPLIED:    { label: 'Applied',    color: 'text-blue-400 bg-blue-900/30' },
  VIEWED:     { label: 'Viewed',     color: 'text-indigo-400 bg-indigo-900/30' },
  ASSESSMENT: { label: 'Assessment', color: 'text-purple-400 bg-purple-900/30' },
  INTERVIEW:  { label: 'Interview',  color: 'text-green-400 bg-green-900/30' },
  GHOSTED:    { label: 'Ghosted',    color: 'text-zinc-600 bg-zinc-900' },
  REJECTED:   { label: 'Rejected',   color: 'text-red-400 bg-red-900/30' },
  OFFER:      { label: 'Offer!',     color: 'text-emerald-400 bg-emerald-900/30' },
  WITHDRAWN:  { label: 'Withdrawn',  color: 'text-zinc-500 bg-zinc-900' },
}

export default function ApplicationsPage() {
  const [apps, setApps] = useState<Application[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [filter, setFilter] = useState('')

  useEffect(() => {
    const load = async () => {
      const params = new URLSearchParams({ page: String(page), pageSize: '20' })
      if (filter) params.set('status', filter)
      const res = await fetch(`/api/applications?${params}`)
      const data = await res.json()
      setApps(data.applications ?? [])
      setTotal(data.total ?? 0)
    }
    load()
  }, [page, filter])

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Applications</h1>
          <p className="text-zinc-500 text-sm mt-1">{total} total applications</p>
        </div>
        <select
          className="bg-zinc-900 border border-zinc-700 text-zinc-300 text-sm rounded-lg px-3 py-2"
          value={filter}
          onChange={(e) => { setFilter(e.target.value); setPage(1) }}
        >
          <option value="">All Status</option>
          {Object.keys(STATUS_CONFIG).map((s) => (
            <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        {apps.map((app) => {
          const cfg = STATUS_CONFIG[app.status] ?? STATUS_CONFIG.PENDING
          const pendingFollowup = app.followups.find((f) => f.status === 'PENDING')
          return (
            <div key={app.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-zinc-700 transition-colors">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-zinc-100">{app.job.title}</span>
                    <span className="text-zinc-500 text-sm">at {app.job.company}</span>
                  </div>
                  <div className="flex gap-3 mt-1 text-xs text-zinc-500">
                    {app.platform && <span className="capitalize">{app.platform}</span>}
                    {app.appliedAt && <span>{new Date(app.appliedAt).toLocaleDateString()}</span>}
                    {app.resumeVersion && <span>Resume: {app.resumeVersion.name}</span>}
                    {app.job.fitScore != null && <span>Fit: {Math.round(app.job.fitScore * 100)}%</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {pendingFollowup && (
                    <span className="text-xs text-yellow-500 bg-yellow-900/30 px-2 py-0.5 rounded-full">
                      Follow-up due {new Date(pendingFollowup.scheduledAt).toLocaleDateString()}
                    </span>
                  )}
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${cfg.color}`}>
                    {cfg.label}
                  </span>
                </div>
              </div>
            </div>
          )
        })}

        {apps.length === 0 && (
          <div className="text-center py-16 text-zinc-600">No applications yet. Start the agent to begin!</div>
        )}
      </div>

      <div className="flex justify-between items-center text-sm">
        <span className="text-zinc-500">Page {page} of {Math.ceil(total / 20) || 1}</span>
        <div className="flex gap-2">
          <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
            className="px-3 py-1.5 bg-zinc-800 text-zinc-300 rounded-lg disabled:opacity-40">Prev</button>
          <button disabled={page * 20 >= total} onClick={() => setPage(p => p + 1)}
            className="px-3 py-1.5 bg-zinc-800 text-zinc-300 rounded-lg disabled:opacity-40">Next</button>
        </div>
      </div>
    </div>
  )
}
