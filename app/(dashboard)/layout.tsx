'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV = [
  { href: '/dashboard',       label: 'Dashboard',      icon: '⬡' },
  { href: '/jobs',            label: 'Jobs',            icon: '🔍' },
  { href: '/applications',    label: 'Applications',    icon: '📋' },
  { href: '/resumes',         label: 'Resumes',         icon: '📄' },
  { href: '/memory',          label: 'Memory',          icon: '🧠' },
  { href: '/logs',            label: 'Logs',            icon: '📊' },
  { href: '/followups',       label: 'Follow-ups',      icon: '📬' },
  { href: '/captcha-queue',   label: 'CAPTCHA Queue',   icon: '🔒' },
  { href: '/settings',        label: 'Settings',        icon: '⚙️' },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="flex min-h-screen bg-zinc-950 text-zinc-100">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 border-r border-zinc-800 flex flex-col">
        <div className="px-5 py-6 border-b border-zinc-800">
          <span className="text-sm font-bold tracking-widest text-indigo-400 uppercase">Job Agent</span>
          <p className="text-xs text-zinc-500 mt-1">Autonomous AI Hunter</p>
        </div>
        <nav className="flex-1 px-2 py-4 space-y-0.5">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                  active
                    ? 'bg-indigo-600 text-white font-medium'
                    : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800'
                }`}
              >
                <span className="text-base leading-none">{item.icon}</span>
                {item.label}
              </Link>
            )
          })}
        </nav>
        <div className="px-4 py-4 border-t border-zinc-800 text-xs text-zinc-600">
          v1.0 · claude-opus-4-8
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-h-screen overflow-auto">
        {children}
      </main>
    </div>
  )
}
