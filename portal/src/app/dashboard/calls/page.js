'use client'
import { useEffect, useState } from 'react'
import api from '../../../lib/api'

const STATUS_COLOR = { ANSWERED: 'text-green-400', BUSY: 'text-amber-400', 'NO ANSWER': 'text-gray-400', FAILED: 'text-red-400' }

export default function Calls() {
  const [cdrs, setCdrs]   = useState([])
  const [total, setTotal] = useState({})
  const [page, setPage]   = useState(1)

  useEffect(() => {
    api.get(`/calls/cdr?page=${page}&limit=50`)
      .then(r => { setCdrs(r.data.cdrs); setTotal(r.data.total) })
      .catch(() => {})
  }, [page])

  const fmt = secs => secs ? `${Math.floor(secs/60)}m ${secs%60}s` : '0s'

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-1">Call Logs</h1>
      <div className="flex gap-4 mb-6 text-sm text-gray-400">
        <span>Total calls: <span className="text-white font-medium">{total.cnt || 0}</span></span>
        <span>Total duration: <span className="text-white font-medium">{fmt(total.total_secs || 0)}</span></span>
        <span>Total cost: <span className="text-white font-medium">₹{parseFloat(total.total_cost || 0).toFixed(2)}</span></span>
      </div>
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-800">
            <tr className="text-gray-400 text-xs uppercase">
              {['From', 'To', 'Start', 'Duration', 'Status', 'Cost', 'Provider'].map(h => (
                <th key={h} className="px-4 py-3 text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {cdrs.map(c => (
              <tr key={c.id} className="hover:bg-gray-800/50">
                <td className="px-4 py-3 font-mono text-white">{c.src}</td>
                <td className="px-4 py-3 font-mono text-white">{c.dst}</td>
                <td className="px-4 py-3 text-gray-400">{new Date(c.start_time).toLocaleString()}</td>
                <td className="px-4 py-3 text-gray-300">{fmt(c.billsec)}</td>
                <td className={`px-4 py-3 font-medium ${STATUS_COLOR[c.disposition] || 'text-gray-400'}`}>{c.disposition}</td>
                <td className="px-4 py-3 text-gray-300">₹{parseFloat(c.cost || 0).toFixed(4)}</td>
                <td className="px-4 py-3 text-gray-500">{c.provider || 'tata'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!cdrs.length && <p className="text-gray-500 text-sm p-6">No call records yet.</p>}
      </div>
      <div className="flex gap-2 mt-4 justify-end">
        <button disabled={page === 1} onClick={() => setPage(p => p-1)} className="px-3 py-1.5 bg-gray-800 text-gray-300 rounded text-sm disabled:opacity-40">← Prev</button>
        <span className="px-3 py-1.5 text-gray-400 text-sm">Page {page}</span>
        <button disabled={cdrs.length < 50} onClick={() => setPage(p => p+1)} className="px-3 py-1.5 bg-gray-800 text-gray-300 rounded text-sm disabled:opacity-40">Next →</button>
      </div>
    </div>
  )
}
