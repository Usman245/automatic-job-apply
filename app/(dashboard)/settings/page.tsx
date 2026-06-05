'use client'

import { useEffect, useState } from 'react'

interface Settings {
  autoApply: boolean
  autoFollowup: boolean
  maxDailyApplications: number
  followupDelayDays: number
  minFitScore: number
  targetRoles: string[]
  linkedinEnabled: boolean
  indeedEnabled: boolean
  atsEnabled: boolean
  emailEnabled: boolean
  wellfoundEnabled: boolean
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(d => setSettings(d.settings))
  }, [])

  const handleSave = async () => {
    if (!settings) return
    setSaving(true)
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (!settings) return <div className="p-8 text-zinc-500">Loading...</div>

  return (
    <div className="p-8 space-y-8 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Settings</h1>
        <p className="text-zinc-500 text-sm mt-1">Configure agent behavior</p>
      </div>

      {/* Automation */}
      <Section title="Automation">
        <Toggle label="Auto Apply" description="Apply without manual approval"
          value={settings.autoApply} onChange={v => setSettings(s => s ? { ...s, autoApply: v } : s)} />
        <Toggle label="Auto Follow-up" description="Send follow-ups automatically"
          value={settings.autoFollowup} onChange={v => setSettings(s => s ? { ...s, autoFollowup: v } : s)} />
        <NumberField label="Max Daily Applications" min={1} max={100}
          value={settings.maxDailyApplications}
          onChange={v => setSettings(s => s ? { ...s, maxDailyApplications: v } : s)} />
        <NumberField label="Follow-up Delay (days)" min={1} max={30}
          value={settings.followupDelayDays}
          onChange={v => setSettings(s => s ? { ...s, followupDelayDays: v } : s)} />
        <div>
          <label className="text-sm text-zinc-400">Minimum Fit Score ({Math.round(settings.minFitScore * 100)}%)</label>
          <input type="range" min="0" max="100" value={Math.round(settings.minFitScore * 100)}
            onChange={e => setSettings(s => s ? { ...s, minFitScore: Number(e.target.value) / 100 } : s)}
            className="w-full mt-1 accent-indigo-500" />
        </div>
      </Section>

      {/* Platforms */}
      <Section title="Platforms">
        <Toggle label="LinkedIn" value={settings.linkedinEnabled}
          onChange={v => setSettings(s => s ? { ...s, linkedinEnabled: v } : s)} />
        <Toggle label="Indeed" value={settings.indeedEnabled}
          onChange={v => setSettings(s => s ? { ...s, indeedEnabled: v } : s)} />
        <Toggle label="ATS (Greenhouse, Lever, Workable)" value={settings.atsEnabled}
          onChange={v => setSettings(s => s ? { ...s, atsEnabled: v } : s)} />
        <Toggle label="Email Applications" value={settings.emailEnabled}
          onChange={v => setSettings(s => s ? { ...s, emailEnabled: v } : s)} />
        <Toggle label="Wellfound" value={settings.wellfoundEnabled}
          onChange={v => setSettings(s => s ? { ...s, wellfoundEnabled: v } : s)} />
      </Section>

      <button onClick={handleSave} disabled={saving}
        className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50">
        {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Settings'}
      </button>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
      <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">{title}</h2>
      {children}
    </div>
  )
}

function Toggle({ label, description, value, onChange }: {
  label: string; description?: string; value: boolean; onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm text-zinc-300">{label}</p>
        {description && <p className="text-xs text-zinc-600">{description}</p>}
      </div>
      <button onClick={() => onChange(!value)}
        className={`relative w-10 h-5 rounded-full transition-colors ${value ? 'bg-indigo-600' : 'bg-zinc-700'}`}>
        <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${value ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </button>
    </div>
  )
}

function NumberField({ label, value, min, max, onChange }: {
  label: string; value: number; min: number; max: number; onChange: (v: number) => void
}) {
  return (
    <div className="flex items-center justify-between">
      <label className="text-sm text-zinc-300">{label}</label>
      <input type="number" min={min} max={max} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-20 bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm rounded-lg px-2 py-1.5 text-center" />
    </div>
  )
}
