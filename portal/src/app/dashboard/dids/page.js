'use client'
import { useEffect, useState } from 'react'
import api from '../../../lib/api'

export default function DIDs() {
  const [dids, setDids]         = useState([])
  const [available, setAvail]   = useState([])
  const [trunks, setTrunks]     = useState([])
  const [browsing, setBrowsing] = useState(false)
  const [selectedTrunk, setST]  = useState('')

  const load = () => {
    api.get('/dids').then(r => setDids(r.data.dids)).catch(() => {})
    api.get('/trunks').then(r => setTrunks(r.data.trunks)).catch(() => {})
  }
  useEffect(() => { load() }, [])

  const browse = () => {
    api.get('/dids/available').then(r => { setAvail(r.data.dids); setBrowsing(true) }).catch(() => {})
  }

  const buy = async (number) => {
    if (!selectedTrunk) { alert('Select a trunk first'); return }
    try {
      await api.post('/dids', { number, trunk_id: selectedTrunk })
      setBrowsing(false); load()
    } catch (err) { alert(err.response?.data?.error || 'Error buying DID') }
  }

  const cancel = async id => {
    if (!confirm('Cancel this DID? It will be released.')) return
    await api.delete(`/dids/${id}`); load()
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">DID Numbers</h1>
          <p className="text-gray-400 text-sm mt-0.5">Phone numbers assigned to your trunks</p>
        </div>
        <button onClick={browse} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium">
          + Buy DID
        </button>
      </div>

      {browsing && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold text-white">Available Numbers</h3>
            <div className="flex items-center gap-3">
              <select className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm" value={selectedTrunk} onChange={e => setST(e.target.value)}>
                <option value="">Select Trunk</option>
                {trunks.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <button onClick={() => setBrowsing(false)} className="text-gray-400 hover:text-white text-sm">Close</button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto">
            {available.map(d => (
              <div key={d.id} className="bg-gray-800 rounded-lg p-3 flex justify-between items-center">
                <div>
                  <p className="font-mono text-white text-sm">{d.number}</p>
                  <p className="text-xs text-gray-400">{d.region} · ₹{d.monthly_rate}/mo</p>
                </div>
                <button onClick={() => buy(d.number)} className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1 rounded text-xs">Buy</button>
              </div>
            ))}
            {!available.length && <p className="text-gray-500 text-sm col-span-2">No numbers available.</p>}
          </div>
        </div>
      )}

      <div className="space-y-3">
        {dids.map(d => (
          <div key={d.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center justify-between">
            <div>
              <p className="font-mono text-white text-lg">{d.number}</p>
              <p className="text-sm text-gray-400">Trunk: {d.trunk_name} · Renews: {d.renewal_date}</p>
              {d.forward_to && <p className="text-xs text-gray-500">→ {d.forward_to}</p>}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-400">₹{d.monthly_rate}/mo</span>
              <span className={`px-2 py-0.5 rounded text-xs ${d.status === 'active' ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'}`}>{d.status}</span>
              <button onClick={() => cancel(d.id)} className="text-gray-500 hover:text-red-400 text-sm">Cancel</button>
            </div>
          </div>
        ))}
        {!dids.length && <p className="text-gray-500 text-sm">No DIDs yet. Buy one above.</p>}
      </div>
    </div>
  )
}
