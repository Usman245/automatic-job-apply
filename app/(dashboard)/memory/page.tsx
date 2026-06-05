'use client'

import { useState } from 'react'

interface MemoryResult {
  jobs: Array<{ id: string; title: string; company: string; similarity: number }>
  resumes: Array<{ id: string; name: string; type: string; similarity: number }>
  applications: Array<{ id: string; status: string; platform: string; similarity: number }>
  insights: string
}

const EXAMPLE_QUERIES = [
  'Successful React Developer applications',
  'Which resumes converted to interviews',
  'Best performing platforms',
  'Frontend jobs with high fit score',
  'Recent offer patterns',
]

export default function MemoryPage() {
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<MemoryResult | null>(null)
  const [loading, setLoading] = useState(false)

  const search = async (q: string) => {
    if (!q.trim()) return
    setLoading(true)
    const res = await fetch('/api/memory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: q, type: 'all', limit: 5 }),
    })
    const data = await res.json()
    setResult(data.result)
    setLoading(false)
  }

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Vector Memory</h1>
        <p className="text-zinc-500 text-sm mt-1">Semantic search across jobs, resumes, and applications</p>
      </div>

      {/* Search */}
      <div className="flex gap-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && search(query)}
          placeholder="Ask the memory system..."
          className="flex-1 bg-zinc-900 border border-zinc-700 text-zinc-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500"
        />
        <button
          onClick={() => search(query)}
          disabled={loading}
          className="px-5 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl disabled:opacity-50"
        >
          {loading ? 'Searching...' : 'Search'}
        </button>
      </div>

      {/* Example queries */}
      <div className="flex flex-wrap gap-2">
        {EXAMPLE_QUERIES.map((q) => (
          <button key={q} onClick={() => { setQuery(q); search(q) }}
            className="text-xs text-zinc-400 bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded-full transition-colors">
            {q}
          </button>
        ))}
      </div>

      {/* Results */}
      {result && (
        <div className="space-y-6">
          {result.insights && (
            <div className="bg-indigo-950 border border-indigo-800 rounded-xl p-4 text-sm text-indigo-200">
              <span className="font-medium text-indigo-400">Insight: </span>
              {result.insights}
            </div>
          )}

          {result.resumes.length > 0 && (
            <ResultSection title="Best Matching Resumes">
              {result.resumes.map((r) => (
                <ResultRow key={r.id} primary={r.name} secondary={r.type} similarity={r.similarity} />
              ))}
            </ResultSection>
          )}

          {result.jobs.length > 0 && (
            <ResultSection title="Similar Jobs">
              {result.jobs.map((j) => (
                <ResultRow key={j.id} primary={j.title} secondary={j.company} similarity={j.similarity} />
              ))}
            </ResultSection>
          )}

          {result.applications.length > 0 && (
            <ResultSection title="Related Applications">
              {result.applications.map((a) => (
                <ResultRow key={a.id} primary={a.status} secondary={a.platform ?? ''} similarity={a.similarity} />
              ))}
            </ResultSection>
          )}
        </div>
      )}
    </div>
  )
}

function ResultSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-2">{title}</h3>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl divide-y divide-zinc-800">
        {children}
      </div>
    </div>
  )
}

function ResultRow({ primary, secondary, similarity }: { primary: string; secondary: string; similarity: number }) {
  return (
    <div className="px-4 py-3 flex items-center justify-between">
      <div>
        <p className="text-sm text-zinc-200">{primary}</p>
        <p className="text-xs text-zinc-500">{secondary}</p>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-20 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
          <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${Math.round(similarity * 100)}%` }} />
        </div>
        <span className="text-xs text-zinc-400 w-10 text-right">{Math.round(similarity * 100)}%</span>
      </div>
    </div>
  )
}
