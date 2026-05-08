'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const nav = [
  { href: '/dashboard',         label: 'Dashboard',    icon: '⬡' },
  { href: '/dashboard/trunks',  label: 'SIP Trunks',   icon: '🔌' },
  { href: '/dashboard/dids',    label: 'DID Numbers',  icon: '📞' },
  { href: '/dashboard/calls',   label: 'Call Logs',    icon: '📋' },
  { href: '/dashboard/billing', label: 'Billing',      icon: '₹' },
]

export default function Sidebar() {
  const path = usePathname()
  return (
    <aside className="w-56 min-h-screen bg-gray-900 border-r border-gray-800 flex flex-col">
      <div className="p-6 border-b border-gray-800">
        <span className="text-xl font-bold text-white">SIPaaS</span>
        <p className="text-xs text-gray-500 mt-0.5">Telephony Platform</p>
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
  )
}
