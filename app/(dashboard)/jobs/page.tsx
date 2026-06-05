'use client'

import { useEffect, useState } from 'react'

interface Job {
  id: string
  title: string
  company: string
  source: string
  status: string
  fitScore?: number
  shouldApply?: boolean
  remote: boolean
  scrapedAt: string
  url: string
}

const STATUS_COLORS: Record<string, string> = {
  FOUND:    'text-zinc-400 bg-zinc-800',
  QUEUED:   'text-yellow-400 bg-yellow-900/30',
  SCORED:   'text-blue-400 bg-blue-900/30',
  READY:    'text-indigo-400 bg-indigo-900/30',
  APPLYING: 'text-orange-400 bg-orange-900/30',
  APPLIED:  'text-green-400 bg-green-900/30',
  SKIPPED:  'text-zinc-600 bg-zinc-900',
  FAILED:   'text-red-400 bg-red-900/30',
}

const PLATFORMS = [
  { value: 'linkedin',  label: 'LinkedIn' },
  { value: 'indeed',    label: 'Indeed' },
  { value: 'wellfound', label: 'Wellfound' },
  { value: 'all',       label: 'All Platforms' },
]

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [applyingId, setApplyingId] = useState<string | null>(null)

  // search form
  const [searchQuery, setSearchQuery] = useState('')
  const [searchPlatform, setSearchPlatform] = useState('linkedin')
  const [searching, setSearching] = useState(false)
  const [searchResult, setSearchResult] = useState<{ found: number; saved: number } | null>(null)
  const [searchError, setSearchError] = useState('')
  const [elapsed, setElapsed] = useState(0)

  const load = async () => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page), pageSize: '25' })
    if (statusFilter) params.set('status', statusFilter)
    const res = await fetch(`/api/jobs?${params}`)
    const data = await res.json()
    setJobs(data.jobs ?? [])
    setTotal(data.total ?? 0)
    setLoading(false)
  }

  useEffect(() => { load() }, [page, statusFilter])

  const handleSearch = async () => {
    if (!searchQuery.trim() || searching) return
    setSearching(true)
    setSearchResult(null)
    setSearchError('')
    setElapsed(0)

    const start = Date.now()
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000)

    try {
      const res = await fetch('/api/jobs/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery.trim(), platform: searchPlatform }),
      })
      const data = await res.json()
      if (!res.ok) {
        setSearchError(data.error ?? 'Search failed')
      } else {
        setSearchResult({ found: data.scraped ?? 0, saved: data.total ?? 0 })
        await load()
      }
    } catch {
      setSearchError('Network error — please try again')
    } finally {
      clearInterval(timer)
      setSearching(false)
    }
  }

  const handleApply = async (jobId: string) => {
    setApplyingId(jobId)
    try {
      await fetch(`/api/jobs/${jobId}/apply`, { method: 'POST' })
      setJobs((prev) => prev.map((j) => j.id === jobId ? { ...j, status: 'APPLYING' } : j))
    } finally {
      setApplyingId(null)
    }
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Jobs</h1>
          <p className="text-zinc-500 text-sm mt-1">{total} jobs in database</p>
        </div>
        <select
          className="bg-zinc-900 border border-zinc-700 text-zinc-300 text-sm rounded-lg px-3 py-2"
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
        >
          <option value="">All Status</option>
          {Object.keys(STATUS_COLORS).map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {/* Search form */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
        <p className="text-sm font-medium text-zinc-300">Find Jobs</p>
        <div className="flex gap-3 flex-wrap">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="e.g. React Developer, Full Stack, Next.js"
            className="flex-1 min-w-[220px] bg-zinc-800 border border-zinc-700 text-zinc-100 placeholder-zinc-600 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
          />
          <select
            value={searchPlatform}
            onChange={(e) => setSearchPlatform(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 text-zinc-300 text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-indigo-500 transition-colors"
          >
            {PLATFORMS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
          <button
            onClick={handleSearch}
            disabled={searching || !searchQuery.trim()}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
          >
            {searching ? (
              <>
                <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Searching{elapsed > 0 ? ` (${elapsed}s)` : '…'}
              </>
            ) : 'Find Jobs'}
          </button>
        </div>

        {searchPlatform === 'all' && !searching && (
          <p className="text-xs text-yellow-500/80">All Platforms searches 6 sources — may take 2-3 minutes.</p>
        )}

        {searchError && (
          <p className="text-xs text-red-400">{searchError}</p>
        )}

        {searchResult && !searching && (
          <p className="text-xs text-emerald-400">
            Found {searchResult.found} listings — {searchResult.saved} new jobs saved to database.
          </p>
        )}
      </div>

      {/* Jobs table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-800">
            <tr className="text-zinc-500 text-xs uppercase tracking-wider">
              <th className="px-4 py-3 text-left">Job</th>
              <th className="px-4 py-3 text-left">Source</th>
              <th className="px-4 py-3 text-left">Fit Score</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Found</th>
              <th className="px-4 py-3 text-left">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-zinc-600">Loading...</td></tr>
            ) : jobs.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center">
                  <p className="text-zinc-500">No jobs yet.</p>
                  <p className="text-zinc-600 text-xs mt-1">Use the search above to discover listings.</p>
                </td>
              </tr>
            ) : jobs.map((job) => {
              const canApply = !['APPLIED', 'APPLYING', 'SKIPPED', 'FAILED'].includes(job.status)
              const isApplying = applyingId === job.id || job.status === 'APPLYING'
              return (
                <tr key={job.id} className="hover:bg-zinc-800/50 transition-colors">
                  <td className="px-4 py-3">
                    <a href={job.url} target="_blank" rel="noopener noreferrer"
                      className="font-medium text-zinc-100 hover:text-indigo-400 transition-colors">
                      {job.title}
                    </a>
                    <p className="text-zinc-500 text-xs">{job.company}</p>
                  </td>
                  <td className="px-4 py-3 text-zinc-400 capitalize">{job.source}</td>
                  <td className="px-4 py-3">
                    {job.fitScore != null ? (
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-indigo-500"
                            style={{ width: `${job.fitScore * 100}%` }}
                          />
                        </div>
                        <span className="text-zinc-300 text-xs">{Math.round(job.fitScore * 100)}%</span>
                      </div>
                    ) : (
                      <span className="text-zinc-600">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[job.status] ?? 'text-zinc-400'}`}>
                      {job.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-500 text-xs">
                    {new Date(job.scrapedAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    {job.status === 'APPLIED' ? (
                      <span className="text-xs text-green-500">Applied</span>
                    ) : canApply ? (
                      <button
                        onClick={() => handleApply(job.id)}
                        disabled={isApplying}
                        className="text-xs px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                      >
                        {isApplying ? 'Applying…' : 'Apply'}
                      </button>
                    ) : (
                      <span className="text-xs text-zinc-600">—</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex justify-between items-center text-sm">
        <span className="text-zinc-500">Page {page} of {Math.max(1, Math.ceil(total / 25))}</span>
        <div className="flex gap-2">
          <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
            className="px-3 py-1.5 bg-zinc-800 text-zinc-300 rounded-lg disabled:opacity-40 hover:bg-zinc-700">
            Prev
          </button>
          <button disabled={page * 25 >= total} onClick={() => setPage(p => p + 1)}
            className="px-3 py-1.5 bg-zinc-800 text-zinc-300 rounded-lg disabled:opacity-40 hover:bg-zinc-700">
            Next
          </button>
        </div>
      </div>
    </div>
  )
}
