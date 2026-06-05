'use client'

import { useEffect, useState } from 'react'

interface Followup {
  id: string
  status: string
  scheduledAt: string
  sentAt?: string
  content?: string
  application: {
    id: string
    platform?: string
    job: { title: string; company: string }
  }
}

export default function FollowupsPage() {
  const [followups, setFollowups] = useState<Followup[]>([])

  useEffect(() => {
    fetch('/api/followups').then(r => r.json()).then(d => setFollowups(d.followups ?? []))
  }, [])

  const pending = followups.filter(f => f.status === 'PENDING')
  const sent = followups.filter(f => f.status === 'SENT')

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Follow-ups</h1>
        <p className="text-zinc-500 text-sm mt-1">{pending.length} pending · {sent.length} sent</p>
      </div>

      {pending.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Pending</h2>
          <div className="space-y-2">
            {pending.map((f) => {
              const overdue = new Date(f.scheduledAt) < new Date()
              return (
                <div key={f.id} className={`bg-zinc-900 border rounded-xl p-4 ${overdue ? 'border-yellow-800/50' : 'border-zinc-800'}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-zinc-200">{f.application.job.title}</p>
                      <p className="text-sm text-zinc-500">{f.application.job.company}</p>
                    </div>
                    <div className="text-right">
                      {overdue ? (
                        <span className="text-xs text-yellow-400 bg-yellow-900/30 px-2 py-0.5 rounded-full">Overdue</span>
                      ) : (
                        <span className="text-xs text-zinc-500">Due {new Date(f.scheduledAt).toLocaleDateString()}</span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {sent.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Sent</h2>
          <div className="space-y-2">
            {sent.map((f) => (
              <div key={f.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="font-medium text-zinc-200">{f.application.job.title}</p>
                    <p className="text-sm text-zinc-500">{f.application.job.company}</p>
                  </div>
                  <span className="text-xs text-green-400">{f.sentAt ? new Date(f.sentAt).toLocaleDateString() : 'Sent'}</span>
                </div>
                {f.content && (
                  <p className="text-xs text-zinc-600 line-clamp-2">{f.content}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {followups.length === 0 && (
        <div className="text-center py-16 text-zinc-600">
          No follow-ups scheduled yet
        </div>
      )}
    </div>
  )
}
