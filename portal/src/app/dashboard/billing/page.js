'use client'
import { useEffect, useState, useCallback } from 'react'
import api from '../../../lib/api'

const TXN_TYPE_LABEL = {
  topup:       { label: 'Top-up',      color: 'text-green-400',  bg: 'bg-green-900/30 border-green-700' },
  call_charge: { label: 'Call Charge', color: 'text-red-400',    bg: 'bg-red-900/30 border-red-700' },
  did_charge:  { label: 'DID Rental',  color: 'text-amber-400',  bg: 'bg-amber-900/30 border-amber-700' },
  refund:      { label: 'Refund',      color: 'text-green-300',  bg: 'bg-green-900/20 border-green-800' },
}

function Badge({ type }) {
  const t = TXN_TYPE_LABEL[type] || { label: type, color: 'text-gray-400', bg: '' }
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium border ${t.bg} ${t.color}`}>
      {t.label}
    </span>
  )
}

function StatCard({ label, value, sub, color = 'indigo', icon }) {
  const border = { indigo: 'border-indigo-500', green: 'border-green-500', amber: 'border-amber-500', rose: 'border-rose-500', blue: 'border-blue-500' }
  return (
    <div className={`bg-gray-900 border border-gray-800 border-l-4 ${border[color]} rounded-xl p-5 flex flex-col gap-1`}>
      <div className="flex items-center gap-2 text-gray-400 text-sm">{icon && <span>{icon}</span>}{label}</div>
      <p className="text-2xl font-bold text-white">{value ?? <span className="text-gray-600 text-base animate-pulse">Loading...</span>}</p>
      {sub && <p className="text-xs text-gray-500">{sub}</p>}
    </div>
  )
}

export default function Billing() {
  const [balance,  setBalance]  = useState(null)
  const [currency, setCurrency] = useState('INR')
  const [txns,     setTxns]     = useState([])
  const [txnTotal, setTxnTotal] = useState(0)
  const [page,     setPage]     = useState(1)
  const [typeFilter, setTypeFilter] = useState('all')
  const [topup,    setTopup]    = useState('')
  const [msg,      setMsg]      = useState(null) // { ok, text }
  const [loading,  setLoading]  = useState(false)
  const [invoice,  setInvoice]  = useState(null)
  const [invoiceMonth, setInvoiceMonth] = useState(() => {
    const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
  })
  const [invoiceLoading, setInvoiceLoading] = useState(false)

  // Stats derived from transactions
  const [stats, setStats] = useState({ today_spend: 0, month_spend: 0, total_topup: 0 })

  const loadBalance = useCallback(() =>
    api.get('/billing/balance')
      .then(r => { setBalance(r.data.balance); setCurrency(r.data.currency || 'INR') })
      .catch(() => setBalance('—'))
  , [])

  const loadTxns = useCallback(() => {
    const params = new URLSearchParams({ page, limit: 20 })
    if (typeFilter !== 'all') params.set('type', typeFilter)
    api.get(`/billing/transactions?${params}`)
      .then(r => {
        const list = r.data.transactions || []
        setTxns(list)
        setTxnTotal(r.data.total || list.length)

        // Compute quick stats from full transaction list (first load only)
        if (page === 1 && typeFilter === 'all') {
          const today = new Date().toDateString()
          const thisMonth = new Date().toISOString().slice(0, 7)
          let todaySpend = 0, monthSpend = 0, totalTopup = 0
          list.forEach(t => {
            const d = new Date(t.created_at)
            const amt = parseFloat(t.amount)
            if (t.type === 'call_charge' || t.type === 'did_charge') {
              if (d.toDateString() === today) todaySpend += Math.abs(amt)
              if (t.created_at.slice(0, 7) === thisMonth) monthSpend += Math.abs(amt)
            }
            if (t.type === 'topup') totalTopup += amt
          })
          setStats({ today_spend: todaySpend, month_spend: monthSpend, total_topup: totalTopup })
        }
      })
      .catch(() => {})
  }, [page, typeFilter])

  useEffect(() => { loadBalance() }, [loadBalance])
  useEffect(() => { loadTxns() }, [loadTxns])

  const doTopup = async e => {
    e.preventDefault(); setMsg(null)
    setLoading(true)
    try {
      const { data } = await api.post('/billing/topup', { amount: parseFloat(topup) })
      setBalance(data.balance)
      setTopup('')
      setMsg({ ok: true, text: `₹${topup} added successfully. New balance: ₹${parseFloat(data.balance).toFixed(2)}` })
      loadTxns()
    } catch (err) {
      setMsg({ ok: false, text: err.response?.data?.error || 'Top-up failed. Please try again.' })
    } finally { setLoading(false) }
  }

  const loadInvoice = async () => {
    setInvoiceLoading(true)
    try {
      const { data } = await api.get(`/billing/invoice/${invoiceMonth}`)
      setInvoice(data)
    } catch { setInvoice(null) }
    setInvoiceLoading(false)
  }

  const fmtDuration = s => {
    if (!s || s === '0') return '0s'
    const m = Math.floor(s / 60), sec = s % 60
    return m ? `${m}m ${sec}s` : `${sec}s`
  }

  const LIMIT = 20
  const totalPages = Math.max(1, Math.ceil(txnTotal / LIMIT))

  return (
    <div className="max-w-6xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold text-white">Billing</h1>
        <span className="text-xs text-gray-500 bg-gray-800 px-3 py-1 rounded-full">
          {currency} · Prepaid
        </span>
      </div>
      <p className="text-gray-400 text-sm mb-6">Manage your balance, top-ups and usage charges</p>

      {/* ── Stats Row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard icon="💰" label="Current Balance" color="green"
          value={balance !== null && balance !== '—' ? `₹${parseFloat(balance).toFixed(2)}` : balance}
          sub="Available to spend" />
        <StatCard icon="📞" label="Today's Spend" color="rose"
          value={`₹${stats.today_spend.toFixed(2)}`}
          sub="Calls + DID charges" />
        <StatCard icon="📅" label="This Month" color="amber"
          value={`₹${stats.month_spend.toFixed(2)}`}
          sub="Month-to-date charges" />
        <StatCard icon="⬆" label="Total Topped Up" color="indigo"
          value={`₹${stats.total_topup.toFixed(2)}`}
          sub="All time" />
      </div>

      {/* ── Top Row: Top-up + Rate Card ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">

        {/* Top-up card */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="font-semibold text-white mb-1 flex items-center gap-2">
            <span>⬆</span> Add Balance
          </h2>
          <p className="text-gray-500 text-xs mb-4">Minimum ₹100 · Credited instantly</p>
          <form onSubmit={doTopup} className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">₹</span>
              <input
                className="w-full pl-8 pr-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30"
                type="number" min={100} step={50}
                placeholder="e.g. 500"
                value={topup}
                onChange={e => setTopup(e.target.value)}
                required
              />
            </div>
            <button
              type="submit" disabled={loading || !topup}
              className="bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white px-5 py-3 rounded-lg text-sm font-semibold transition flex items-center gap-1.5">
              {loading ? '⏳' : '+'} Add
            </button>
          </form>
          {msg && (
            <div className={`mt-3 p-3 rounded-lg border text-sm ${msg.ok ? 'bg-green-900/30 border-green-700 text-green-400' : 'bg-red-900/30 border-red-700 text-red-400'}`}>
              {msg.ok ? '✓ ' : '✗ '}{msg.text}
            </div>
          )}
          <p className="text-xs text-gray-600 mt-3">
            Payment integration (Razorpay / Stripe) can be connected here.
          </p>
        </div>

        {/* Rate Card */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
            <span>📋</span> Rate Card
          </h2>
          <div className="space-y-0">
            {[
              ['🇮🇳', 'India Mobile (+91)',   '₹0.45 / min'],
              ['🇺🇸', 'USA / Canada (+1)',     '₹1.50 / min'],
              ['🇬🇧', 'UK (+44)',              '₹1.80 / min'],
              ['🌐', 'International',          '₹3.00 / min'],
              ['📱', 'DID Number Rental',      '₹500 / month'],
            ].map(([flag, dest, rate]) => (
              <div key={dest} className="flex items-center justify-between py-2.5 border-b border-gray-800 last:border-0">
                <span className="text-gray-400 text-sm flex items-center gap-2">
                  <span>{flag}</span>{dest}
                </span>
                <span className="text-white text-sm font-mono font-medium">{rate}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Monthly Invoice ── */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-white flex items-center gap-2">
            <span>🧾</span> Monthly Invoice
          </h2>
          <div className="flex items-center gap-2">
            <input
              type="month"
              value={invoiceMonth}
              onChange={e => { setInvoiceMonth(e.target.value); setInvoice(null) }}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
            />
            <button onClick={loadInvoice} disabled={invoiceLoading}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition">
              {invoiceLoading ? '⏳' : '🔍'} View
            </button>
          </div>
        </div>

        {invoice ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-gray-800 rounded-lg p-4 text-center">
              <p className="text-gray-400 text-xs mb-1">Total Calls</p>
              <p className="text-2xl font-bold text-white">{invoice.calls?.call_count || 0}</p>
              <p className="text-xs text-gray-500 mt-1">answered only</p>
            </div>
            <div className="bg-gray-800 rounded-lg p-4 text-center">
              <p className="text-gray-400 text-xs mb-1">Total Duration</p>
              <p className="text-2xl font-bold text-white">{fmtDuration(invoice.calls?.total_secs || 0)}</p>
              <p className="text-xs text-gray-500 mt-1">billed minutes</p>
            </div>
            <div className="bg-gray-800 rounded-lg p-4 text-center">
              <p className="text-gray-400 text-xs mb-1">Call Charges</p>
              <p className="text-2xl font-bold text-red-400">₹{parseFloat(invoice.calls?.total_cost || 0).toFixed(2)}</p>
              <p className="text-xs text-gray-500 mt-1">voice usage</p>
            </div>
            <div className="bg-gray-800 rounded-lg p-4 text-center">
              <p className="text-gray-400 text-xs mb-1">DID Charges</p>
              <p className="text-2xl font-bold text-amber-400">₹{parseFloat(invoice.dids?.did_cost || 0).toFixed(2)}</p>
              <p className="text-xs text-gray-500 mt-1">{invoice.dids?.did_count || 0} numbers</p>
            </div>
            <div className="col-span-2 lg:col-span-4 bg-gray-800 border border-gray-700 rounded-lg p-4 flex items-center justify-between">
              <span className="text-gray-300 font-medium">Total Due — {invoice.month}</span>
              <span className="text-2xl font-bold text-white">₹{parseFloat(invoice.total_due).toFixed(2)}</span>
            </div>
          </div>
        ) : (
          <p className="text-gray-500 text-sm">Select a month and click <strong className="text-gray-300">View</strong> to generate an invoice summary.</p>
        )}
      </div>

      {/* ── Transaction History ── */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-white flex items-center gap-2">
          <span>📒</span> Transaction History
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Filter:</span>
          {['all','topup','call_charge','did_charge','refund'].map(t => (
            <button key={t}
              onClick={() => { setTypeFilter(t); setPage(1) }}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition ${typeFilter === t ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'}`}>
              {t === 'all' ? 'All' : TXN_TYPE_LABEL[t]?.label || t}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-800 bg-gray-950/50">
            <tr className="text-gray-400 text-xs uppercase tracking-wide">
              {['Type', 'Amount', 'Balance After', 'Description', 'Date & Time'].map(h => (
                <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {txns.map(t => (
              <tr key={t.id} className="hover:bg-gray-800/40 transition-colors">
                <td className="px-4 py-3.5">
                  <Badge type={t.type} />
                </td>
                <td className={`px-4 py-3.5 font-mono font-semibold ${parseFloat(t.amount) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {parseFloat(t.amount) >= 0 ? '+' : ''}₹{Math.abs(parseFloat(t.amount)).toFixed(4)}
                </td>
                <td className="px-4 py-3.5 text-gray-300 font-mono">
                  ₹{parseFloat(t.balance_after).toFixed(2)}
                </td>
                <td className="px-4 py-3.5 text-gray-400 max-w-xs truncate">
                  {t.description || '—'}
                </td>
                <td className="px-4 py-3.5 text-gray-500 text-xs whitespace-nowrap">
                  {new Date(t.created_at).toLocaleString('en-IN', {
                    day: '2-digit', month: 'short', year: 'numeric',
                    hour: '2-digit', minute: '2-digit'
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!txns.length && (
          <div className="p-8 text-center">
            <p className="text-gray-500 text-sm">No transactions found.</p>
            {typeFilter !== 'all' && (
              <button onClick={() => setTypeFilter('all')} className="text-blue-400 text-xs mt-1 underline">Clear filter</button>
            )}
          </div>
        )}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between mt-4">
        <p className="text-xs text-gray-500">
          Showing {((page - 1) * LIMIT) + 1}–{Math.min(page * LIMIT, txnTotal || txns.length)} of {txnTotal || txns.length} transactions
        </p>
        <div className="flex gap-1.5">
          <button disabled={page === 1} onClick={() => setPage(1)}
            className="px-2.5 py-1.5 bg-gray-800 text-gray-400 rounded text-xs disabled:opacity-30 hover:bg-gray-700 transition">
            «
          </button>
          <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
            className="px-3 py-1.5 bg-gray-800 text-gray-300 rounded text-sm disabled:opacity-30 hover:bg-gray-700 transition">
            ← Prev
          </button>
          <span className="px-3 py-1.5 text-gray-400 text-sm">
            Page {page} {totalPages > 1 ? `of ${totalPages}` : ''}
          </span>
          <button disabled={txns.length < LIMIT} onClick={() => setPage(p => p + 1)}
            className="px-3 py-1.5 bg-gray-800 text-gray-300 rounded text-sm disabled:opacity-30 hover:bg-gray-700 transition">
            Next →
          </button>
        </div>
      </div>
    </div>
  )
}
