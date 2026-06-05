'use client'

import { useEffect, useState, useCallback } from 'react'

interface CaptchaItem {
  id: string
  workflowId: string
  url: string
  platform: string
  status: string
  createdAt: string
  expiresAt: string
}

export default function CaptchaQueuePage() {
  const [items, setItems] = useState<CaptchaItem[]>([])
  const [resolving, setResolving] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/captcha')
    const data = await res.json()
    setItems(data.pending ?? [])
  }, [])

  useEffect(() => {
    load()
    const interval = setInterval(load, 10_000)
    return () => clearInterval(interval)
  }, [load])

  const handleAction = async (id: string, action: 'resolved' | 'skip') => {
    setResolving(id)
    await fetch('/api/captcha', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ captchaId: id, action }),
    })
    await load()
    setResolving(null)
  }

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">CAPTCHA Queue</h1>
        <p className="text-zinc-500 text-sm mt-1">
          Manual intervention required. Visit the URL, solve the CAPTCHA, then click Resolved.
        </p>
      </div>

      {items.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-12 text-center">
          <p className="text-zinc-500 text-4xl mb-3">✓</p>
          <p className="text-zinc-400">No pending CAPTCHAs</p>
          <p className="text-zinc-600 text-sm mt-1">The agent is running uninterrupted</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const expired = new Date(item.expiresAt) < new Date()
            return (
              <div key={item.id}
                className="bg-zinc-900 border border-orange-800/50 rounded-xl p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-orange-400 text-sm font-medium uppercase">{item.platform}</span>
                      {expired && (
                        <span className="text-xs text-red-400 bg-red-900/30 px-2 py-0.5 rounded-full">Expired</span>
                      )}
                    </div>
                    <a href={item.url} target="_blank" rel="noopener noreferrer"
                      className="text-sm text-indigo-400 hover:text-indigo-300 underline truncate block">
                      {item.url}
                    </a>
                    <p className="text-xs text-zinc-600 mt-1">
                      Workflow: {item.workflowId.slice(0, 12)}... ·
                      Detected: {new Date(item.createdAt).toLocaleTimeString()} ·
                      Expires: {new Date(item.expiresAt).toLocaleTimeString()}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => handleAction(item.id, 'skip')}
                      disabled={resolving === item.id}
                      className="px-3 py-1.5 text-sm text-zinc-400 bg-zinc-800 hover:bg-zinc-700 rounded-lg disabled:opacity-40"
                    >
                      Skip
                    </button>
                    <button
                      onClick={() => handleAction(item.id, 'resolved')}
                      disabled={resolving === item.id || expired}
                      className="px-3 py-1.5 text-sm font-medium text-white bg-green-700 hover:bg-green-600 rounded-lg disabled:opacity-40"
                    >
                      {resolving === item.id ? 'Resuming...' : 'Resolved — Resume'}
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
