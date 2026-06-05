'use client'

import { useEffect, useState } from 'react'

interface Log {
  id: string
  level: string
  type: string
  tool?: string
  message: string
  duration?: number
  createdAt: string
  data?: unknown
}

const LEVEL_COLORS: Record<string, string> = {
  debug: 'text-zinc-500',
  info:  'text-blue-400',
  warn:  'text-yellow-400',
  error: 'text-red-400',
}

export default function LogsPage() {
  const [logs, setLogs] = useState<Log[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [level, setLevel] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      const params = new URLSearchParams({ page: String(page), pageSize: '50' })
      if (level) params.set('level', level)
      const res = await fetch(`/api/logs?${params}`)
      const data = await res.json()
      setLogs(data.logs ?? [])
      setTotal(data.total ?? 0)
    }
    load()
    const iv = setInterval(load, 5_000)
    return () => clearInterval(iv)
  }, [page, level])

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Audit Logs</h1>
          <p className="text-zinc-500 text-sm mt-1">{total} entries</p>
        </div>
        <select
          className="bg-zinc-900 border border-zinc-700 text-zinc-300 text-sm rounded-lg px-3 py-2"
          value={level} onChange={(e) => { setLevel(e.target.value); setPage(1) }}
        >
          <option value="">All Levels</option>
          <option value="error">Error</option>
          <option value="warn">Warning</option>
          <option value="info">Info</option>
          <option value="debug">Debug</option>
        </select>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl font-mono text-xs overflow-hidden">
        <div className="divide-y divide-zinc-800/50">
          {logs.map((log) => (
            <div key={log.id}
              className="px-4 py-2.5 hover:bg-zinc-800/30 cursor-pointer"
              onClick={() => setExpanded(expanded === log.id ? null : log.id)}
            >
              <div className="flex items-center gap-3">
                <span className="text-zinc-600 w-20 shrink-0">
                  {new Date(log.createdAt).toLocaleTimeString()}
                </span>
                <span className={`w-10 font-bold uppercase ${LEVEL_COLORS[log.level] ?? 'text-zinc-400'}`}>
                  {log.level}
                </span>
                <span className="text-zinc-500 w-24 truncate shrink-0">{log.type}</span>
                {log.tool && <span className="text-indigo-400 w-32 truncate shrink-0">{log.tool}</span>}
                <span className="text-zinc-300 flex-1 truncate">{log.message}</span>
                {log.duration != null && (
                  <span className="text-zinc-600 shrink-0">{log.duration}ms</span>
                )}
              </div>
              {expanded === log.id && log.data != null && (
                <pre className="mt-2 text-zinc-500 text-xs overflow-auto max-h-40 pl-36">
                  {JSON.stringify(log.data as object, null, 2)}
                </pre>
              )}
            </div>
          ))}
          {logs.length === 0 && (
            <div className="px-4 py-8 text-center text-zinc-600">No logs yet</div>
          )}
        </div>
      </div>

      <div className="flex justify-between items-center text-sm">
        <span className="text-zinc-500">Page {page} of {Math.ceil(total / 50) || 1}</span>
        <div className="flex gap-2">
          <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
            className="px-3 py-1.5 bg-zinc-800 text-zinc-300 rounded-lg disabled:opacity-40">Prev</button>
          <button disabled={page * 50 >= total} onClick={() => setPage(p => p + 1)}
            className="px-3 py-1.5 bg-zinc-800 text-zinc-300 rounded-lg disabled:opacity-40">Next</button>
        </div>
      </div>
    </div>
  )
}
