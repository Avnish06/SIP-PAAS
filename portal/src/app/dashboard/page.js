'use client'
import { useEffect, useState } from 'react'
import api from '../../lib/api'

function StatCard({ label, value, sub, color = 'indigo' }) {
  const colors = { indigo: 'border-indigo-500', green: 'border-green-500', amber: 'border-amber-500', rose: 'border-rose-500' }
  return (
    <div className={`bg-gray-900 border border-gray-800 border-l-4 ${colors[color]} rounded-xl p-5`}>
      <p className="text-gray-400 text-sm">{label}</p>
      <p className="text-2xl font-bold text-white mt-1">{value ?? '—'}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  )
}

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  useEffect(() => { api.get('/accounts/stats').then(r => setStats(r.data)).catch(() => {}) }, [])

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-1">Dashboard</h1>
      <p className="text-gray-400 text-sm mb-8">Your SIP platform at a glance</p>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Balance" value={stats ? `₹${parseFloat(stats.balance).toFixed(2)}` : null} color="green" />
        <StatCard label="Active Trunks" value={stats?.active_trunks} sub="SIP credential sets" color="indigo" />
        <StatCard label="Active DIDs" value={stats?.active_dids} sub="Phone numbers" color="amber" />
        <StatCard label="Calls Today" value={stats?.today?.calls} sub={`₹${parseFloat(stats?.today?.spend || 0).toFixed(2)} spent`} color="rose" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="font-semibold text-white mb-3">This Month</h2>
          <p className="text-3xl font-bold text-white">{stats?.this_month?.calls ?? 0} <span className="text-sm font-normal text-gray-400">calls</span></p>
          <p className="text-gray-400 text-sm mt-1">₹{parseFloat(stats?.this_month?.spend || 0).toFixed(2)} billed</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="font-semibold text-white mb-3">Quick Setup</h2>
          <ol className="text-sm text-gray-400 space-y-1.5 list-decimal list-inside">
            <li>Top up your balance</li>
            <li>Create a SIP Trunk</li>
            <li>Buy a DID number</li>
            <li>Configure your PBX/softphone</li>
          </ol>
        </div>
      </div>
    </div>
  )
}
