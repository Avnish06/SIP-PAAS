'use client'
import { useEffect, useState } from 'react'
import api from '../../../lib/api'

export default function Trunks() {
  const [trunks, setTrunks] = useState([])
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ name: '', auth_type: 'digest', ip_whitelist: '', max_channels: 2 })
  const [newTrunk, setNewTrunk] = useState(null)

  const load = () => api.get('/trunks').then(r => setTrunks(r.data.trunks)).catch(() => {})
  useEffect(() => { load() }, [])

  const create = async e => {
    e.preventDefault()
    try {
      const { data } = await api.post('/trunks', form)
      setNewTrunk(data); setCreating(false); load()
    } catch (err) { alert(err.response?.data?.error || 'Error') }
  }

  const del = async id => {
    if (!confirm('Delete this trunk?')) return
    await api.delete(`/trunks/${id}`); load()
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">SIP Trunks</h1>
          <p className="text-gray-400 text-sm mt-0.5">Each trunk = SIP credentials + channel limit</p>
        </div>
        <button onClick={() => { setCreating(true); setNewTrunk(null) }}
          className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium">
          + New Trunk
        </button>
      </div>

      {newTrunk && (
        <div className="bg-green-900/30 border border-green-700 rounded-xl p-5 mb-6">
          <h3 className="text-green-400 font-semibold mb-3">✓ Trunk Created — Save these credentials</h3>
          <div className="grid grid-cols-2 gap-3 text-sm font-mono">
            {[['SIP Server', newTrunk.sip_domain], ['Port', newTrunk.sip_port], ['Username', newTrunk.sip_username], ['Password', newTrunk.sip_password]].map(([k, v]) => (
              <div key={k} className="bg-gray-900 rounded-lg p-3">
                <span className="text-gray-400">{k}: </span><span className="text-white">{v}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {creating && (
        <form onSubmit={create} className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-6 space-y-4">
          <h3 className="font-semibold text-white">Create Trunk</h3>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="text-xs text-gray-400 block mb-1">Trunk Name</label>
              <input className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white text-sm" value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="My Office PBX" required />
            </div>
            <div><label className="text-xs text-gray-400 block mb-1">Max Channels</label>
              <input type="number" min={1} max={100} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white text-sm" value={form.max_channels} onChange={e => setForm({...form, max_channels: e.target.value})} />
            </div>
            <div><label className="text-xs text-gray-400 block mb-1">Auth Type</label>
              <select className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white text-sm" value={form.auth_type} onChange={e => setForm({...form, auth_type: e.target.value})}>
                <option value="digest">Digest (Username/Password)</option>
                <option value="ip">IP-based (whitelist)</option>
              </select>
            </div>
            {form.auth_type === 'ip' && <div><label className="text-xs text-gray-400 block mb-1">IP Whitelist (comma-separated)</label>
              <input className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white text-sm" value={form.ip_whitelist} onChange={e => setForm({...form, ip_whitelist: e.target.value})} placeholder="1.2.3.4,5.6.7.8" />
            </div>}
          </div>
          <div className="flex gap-3">
            <button type="submit" className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded text-sm">Create</button>
            <button type="button" onClick={() => setCreating(false)} className="bg-gray-800 text-gray-300 px-4 py-2 rounded text-sm">Cancel</button>
          </div>
        </form>
      )}

      <div className="space-y-3">
        {trunks.map(t => (
          <div key={t.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center justify-between">
            <div>
              <p className="font-medium text-white">{t.name}</p>
              <p className="text-sm text-gray-400 font-mono">{t.sip_username}@{t.sip_domain}</p>
              <p className="text-xs text-gray-500 mt-0.5">{t.auth_type === 'ip' ? '🔒 IP Auth' : '🔑 Digest Auth'} · {t.max_channels} channels</p>
            </div>
            <div className="flex items-center gap-3">
              <span className={`px-2 py-0.5 rounded text-xs ${t.status === 'active' ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'}`}>{t.status}</span>
              <button onClick={() => del(t.id)} className="text-gray-500 hover:text-red-400 text-sm">Delete</button>
            </div>
          </div>
        ))}
        {!trunks.length && <p className="text-gray-500 text-sm">No trunks yet. Create one above.</p>}
      </div>
    </div>
  )
}
