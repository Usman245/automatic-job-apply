'use client'

import { useEffect, useState } from 'react'

interface Resume {
  id: string
  name: string
  type: string
  version: number
  isActive: boolean
  applicationCount: number
  interviewCount: number
  offerCount: number
  pdfPath?: string
  createdAt: string
  _count: { applications: number }
}

const TYPE_COLORS: Record<string, string> = {
  frontend:  'text-blue-400 bg-blue-900/30',
  react:     'text-cyan-400 bg-cyan-900/30',
  fullstack: 'text-indigo-400 bg-indigo-900/30',
  junior_ai: 'text-purple-400 bg-purple-900/30',
  mern:      'text-green-400 bg-green-900/30',
}

const TEMPLATE = {
  name: 'Your Full Name',
  email: 'you@email.com',
  phone: '+92 300 0000000',
  location: 'Remote / Pakistan',
  summary: 'React & Next.js developer with 2 years of experience building responsive web apps. Comfortable across the full stack with Node.js, TypeScript, and PostgreSQL.',
  skills: ['React', 'Next.js', 'TypeScript', 'JavaScript', 'Node.js', 'PostgreSQL', 'TailwindCSS', 'REST APIs', 'Git'],
  experience: [
    {
      company: 'Company Name',
      title: 'Frontend Developer',
      startDate: '2023-01',
      endDate: undefined,
      bullets: [
        'Built and maintained React-based features for 10k+ user SaaS product',
        'Reduced page load time by 40% via code-splitting and lazy loading',
        'Collaborated with designers to implement pixel-perfect UI components',
      ],
      skills: ['React', 'TypeScript', 'TailwindCSS'],
    },
  ],
  projects: [
    {
      name: 'Project Name',
      url: 'https://github.com/you/project',
      description: 'A full-stack Next.js app with PostgreSQL and Prisma. Handles auth, CRUD, and real-time updates.',
      skills: ['Next.js', 'Prisma', 'PostgreSQL'],
    },
  ],
  education: [
    {
      institution: 'University Name',
      degree: 'Bachelor',
      field: 'Computer Science',
      graduationYear: 2023,
    },
  ],
  links: {
    github: 'https://github.com/yourusername',
    linkedin: 'https://linkedin.com/in/yourusername',
  },
}

export default function ResumesPage() {
  const [resumes, setResumes] = useState<Resume[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formName, setFormName] = useState('')
  const [formType, setFormType] = useState('react')
  const [formJson, setFormJson] = useState(JSON.stringify(TEMPLATE, null, 2))
  const [jsonError, setJsonError] = useState('')

  const load = async () => {
    setLoading(true)
    const res = await fetch('/api/resumes')
    const data = await res.json()
    setResumes(data.resumes ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const handleDelete = async (id: string) => {
    await fetch(`/api/resumes?id=${id}`, { method: 'DELETE' })
    load()
  }

  const handleJsonChange = (val: string) => {
    setFormJson(val)
    try { JSON.parse(val); setJsonError('') }
    catch { setJsonError('Invalid JSON') }
  }

  const handleSubmit = async () => {
    if (!formName.trim()) { setJsonError('Name is required'); return }
    let content
    try { content = JSON.parse(formJson) }
    catch { setJsonError('Fix JSON errors before saving'); return }

    setSaving(true)
    const res = await fetch('/api/resumes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: formName, type: formType, content }),
    })
    setSaving(false)

    if (res.ok) {
      setShowForm(false)
      setFormName('')
      setFormJson(JSON.stringify(TEMPLATE, null, 2))
      load()
    } else {
      const data = await res.json()
      setJsonError(data.error ?? 'Save failed')
    }
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Resumes</h1>
          <p className="text-zinc-500 text-sm mt-1">{resumes.length} version{resumes.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          + Add Resume
        </button>
      </div>

      {/* Add Resume Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
              <h2 className="text-zinc-100 font-semibold">Add Resume</h2>
              <button onClick={() => setShowForm(false)} className="text-zinc-500 hover:text-zinc-300 text-xl leading-none">×</button>
            </div>

            <div className="overflow-y-auto flex-1 p-6 space-y-4">
              {/* Name + Type row */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-zinc-500 uppercase tracking-wider mb-1.5">Resume Name</label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g. Usman - React Developer"
                    className="w-full bg-zinc-800 border border-zinc-700 text-zinc-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 uppercase tracking-wider mb-1.5">Type</label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 text-zinc-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                  >
                    <option value="react">React</option>
                    <option value="frontend">Frontend</option>
                    <option value="fullstack">Full Stack</option>
                    <option value="mern">MERN</option>
                    <option value="junior_ai">Junior AI</option>
                  </select>
                </div>
              </div>

              {/* JSON editor */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs text-zinc-500 uppercase tracking-wider">Resume Content (JSON)</label>
                  <span className="text-xs text-zinc-600">Edit the template below with your real info</span>
                </div>
                <textarea
                  value={formJson}
                  onChange={(e) => handleJsonChange(e.target.value)}
                  rows={22}
                  spellCheck={false}
                  className="w-full bg-zinc-950 border border-zinc-700 text-zinc-300 rounded-lg px-4 py-3 text-xs font-mono focus:outline-none focus:border-indigo-500 resize-none"
                />
                {jsonError && <p className="text-red-400 text-xs mt-1">{jsonError}</p>}
              </div>
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t border-zinc-800">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-zinc-400 hover:text-zinc-200 text-sm">
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={saving || !!jsonError}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
              >
                {saving ? 'Saving…' : 'Save & Generate PDF'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Resume cards */}
      <div className="grid gap-4 md:grid-cols-2">
        {loading ? (
          <div className="col-span-2 text-center py-16 text-zinc-600">Loading...</div>
        ) : resumes.length === 0 ? (
          <div className="col-span-2 text-center py-16 space-y-3">
            <p className="text-zinc-500 text-lg">No resumes yet</p>
            <p className="text-zinc-600 text-sm">Add your resume so the agent can apply to jobs on your behalf.</p>
            <button
              onClick={() => setShowForm(true)}
              className="mt-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              + Add Your First Resume
            </button>
          </div>
        ) : resumes.map((r) => {
          const convRate = r.applicationCount > 0
            ? Math.round((r.interviewCount / r.applicationCount) * 100)
            : 0

          return (
            <div key={r.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-zinc-100">{r.name}</h3>
                  <div className="flex gap-2 mt-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${TYPE_COLORS[r.type] ?? 'text-zinc-400 bg-zinc-800'}`}>
                      {r.type}
                    </span>
                    <span className="text-xs text-zinc-600">v{r.version}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  {r.pdfPath && (
                    <a href={r.pdfPath} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-indigo-400 hover:text-indigo-300 underline">
                      PDF
                    </a>
                  )}
                  <button onClick={() => handleDelete(r.id)}
                    className="text-xs text-red-500 hover:text-red-400">
                    Archive
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-zinc-800 rounded-lg py-2">
                  <p className="text-lg font-bold text-zinc-100">{r.applicationCount}</p>
                  <p className="text-xs text-zinc-500">Applications</p>
                </div>
                <div className="bg-zinc-800 rounded-lg py-2">
                  <p className="text-lg font-bold text-zinc-100">{r.interviewCount}</p>
                  <p className="text-xs text-zinc-500">Interviews</p>
                </div>
                <div className="bg-zinc-800 rounded-lg py-2">
                  <p className="text-lg font-bold text-zinc-100">{convRate}%</p>
                  <p className="text-xs text-zinc-500">Conversion</p>
                </div>
              </div>

              {r.offerCount > 0 && (
                <div className="text-center text-sm text-emerald-400 bg-emerald-900/20 rounded-lg py-1.5">
                  {r.offerCount} offer{r.offerCount > 1 ? 's' : ''} generated
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
