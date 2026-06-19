'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'

const nav = [
  { href: '/dashboard',         label: 'Dashboard',    icon: '⬡' },
  { href: '/dashboard/trunks',  label: 'SIP Trunks',   icon: '🔌' },
  { href: '/dashboard/dids',    label: 'DID Numbers',  icon: '📞' },
  { href: '/dashboard/calls',   label: 'Call Logs',    icon: '📋' },
  { href: '/dashboard/billing', label: 'Billing',      icon: '₹' },
]

export default function Sidebar() {
  const path = usePathname()
  const [open, setOpen] = useState(false)

  // Close the mobile drawer whenever the route changes.
  useEffect(() => { setOpen(false) }, [path])

  return (
    <>
      {/* Mobile top bar with hamburger — only visible below md */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-30 flex items-center gap-3 h-14 px-4 bg-gray-900 border-b border-gray-800">
        <button onClick={() => setOpen(true)} aria-label="Open menu"
          className="text-white text-2xl leading-none w-8 h-8 flex items-center justify-center">☰</button>
        <span className="text-lg font-bold text-white">SIPaaS</span>
      </div>

      {/* Backdrop behind the drawer on mobile */}
      {open && (
        <div className="md:hidden fixed inset-0 bg-black/60 z-40" onClick={() => setOpen(false)} />
      )}

      {/* Sidebar: off-canvas drawer on mobile, static column on desktop */}
      <aside className={`w-64 max-w-[80vw] md:w-56 bg-gray-900 border-r border-gray-800 flex flex-col z-50
        fixed inset-y-0 left-0 transition-transform duration-200 ease-out
        md:static md:translate-x-0 md:min-h-screen
        ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-6 border-b border-gray-800 flex items-center justify-between">
          <div>
            <span className="text-xl font-bold text-white">SIPaaS</span>
            <p className="text-xs text-gray-500 mt-0.5">Telephony Platform</p>
          </div>
          {/* Close button — mobile only */}
          <button onClick={() => setOpen(false)} aria-label="Close menu"
            className="md:hidden text-gray-400 hover:text-white text-2xl leading-none w-8 h-8 flex items-center justify-center">×</button>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {nav.map(item => (
            <Link key={item.href} href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition
                ${path === item.href ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}>
              <span>{item.icon}</span>{item.label}
            </Link>
          ))}
        </nav>
        <div className="p-4 border-t border-gray-800">
          <button onClick={() => { localStorage.removeItem('sipaas_token'); window.location.href = '/login' }}
            className="text-sm text-gray-500 hover:text-red-400 transition">Sign Out</button>
        </div>
      </aside>
    </>
  )
}
