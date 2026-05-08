'use client'
import { useEffect, useState } from 'react'
import api from '../../../lib/api'

export default function Billing() {
  const [balance, setBalance] = useState(null)
  const [txns, setTxns]       = useState([])
  const [topup, setTopup]     = useState('')
  const [msg, setMsg]         = useState('')

  const load = () => {
    api.get('/billing/balance').then(r => setBalance(r.data.balance)).catch(() => {})
    api.get('/billing/transactions').then(r => setTxns(r.data.transactions)).catch(() => {})
  }
  useEffect(() => { load() }, [])

  const doTopup = async e => {
    e.preventDefault(); setMsg('')
    try {
      const { data } = await api.post('/billing/topup', { amount: parseFloat(topup) })
      setBalance(data.balance); setTopup('')
      setMsg(`₹${topup} added. New balance: ₹${data.balance}`)
      load()
    } catch (err) { setMsg(err.response?.data?.error || 'Error') }
  }

  const TXN_COLOR = { topup: 'text-green-400', call_charge: 'text-red-400', did_charge: 'text-amber-400', refund: 'text-green-300' }

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Billing</h1>
      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <p className="text-gray-400 text-sm">Current Balance</p>
          <p className="text-4xl font-bold text-white mt-1">₹{parseFloat(balance || 0).toFixed(2)}</p>
          <p className="text-xs text-gray-500 mt-1">INR · Prepaid</p>
          <form onSubmit={doTopup} className="mt-4 flex gap-2">
            <input className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white text-sm" type="number" min={100} placeholder="Top-up amount (₹)" value={topup} onChange={e => setTopup(e.target.value)} required />
            <button className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded text-sm font-medium">Add</button>
          </form>
          {msg && <p className="text-sm text-green-400 mt-2">{msg}</p>}
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <p className="text-gray-400 text-sm mb-3">Rate Card</p>
          {[['India Mobile (+91)', '₹0.45/min'], ['USA/Canada (+1)', '₹1.50/min'], ['UK (+44)', '₹1.80/min'], ['International (+)', '₹3.00/min'], ['DID Rental', '₹500/mo']].map(([d, r]) => (
            <div key={d} className="flex justify-between text-sm py-1.5 border-b border-gray-800 last:border-0">
              <span className="text-gray-400">{d}</span><span className="text-white">{r}</span>
            </div>
          ))}
        </div>
      </div>
      <h2 className="font-semibold text-white mb-3">Transaction History</h2>
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-800">
            <tr className="text-gray-400 text-xs uppercase">
              {['Type', 'Amount', 'Balance After', 'Description', 'Date'].map(h => (
                <th key={h} className="px-4 py-3 text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {txns.map(t => (
              <tr key={t.id} className="hover:bg-gray-800/50">
                <td className={`px-4 py-3 font-medium ${TXN_COLOR[t.type] || 'text-gray-300'}`}>{t.type.replace('_', ' ')}</td>
                <td className={`px-4 py-3 font-mono ${parseFloat(t.amount) > 0 ? 'text-green-400' : 'text-red-400'}`}>{parseFloat(t.amount) > 0 ? '+' : ''}₹{Math.abs(t.amount).toFixed(4)}</td>
                <td className="px-4 py-3 text-gray-300">₹{parseFloat(t.balance_after).toFixed(2)}</td>
                <td className="px-4 py-3 text-gray-400">{t.description}</td>
                <td className="px-4 py-3 text-gray-500">{new Date(t.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!txns.length && <p className="text-gray-500 text-sm p-6">No transactions yet.</p>}
      </div>
    </div>
  )
}
