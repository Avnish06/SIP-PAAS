'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import api from '../../lib/api'

export default function Login() {
  const [tab, setTab]     = useState('login')
  const [form, setForm]   = useState({ email: '', password: '', name: '' })
  const [error, setError] = useState('')
  const router = useRouter()

  const handle = async e => {
    e.preventDefault(); setError('')
    try {
      if (tab === 'login') {
        const { data } = await api.post('/auth/login', { email: form.email, password: form.password })
        localStorage.setItem('sipaas_token', data.token)
        router.push('/dashboard')
      } else {
        await api.post('/auth/register', form)
        setTab('login'); setError('Account created — please log in.')
      }
    } catch (err) { setError(err.response?.data?.error || 'Something went wrong') }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="bg-gray-900 rounded-2xl p-8 w-full max-w-md shadow-2xl border border-gray-800">
        <h1 className="text-2xl font-bold text-white mb-2">SIPaaS</h1>
        <p className="text-gray-400 text-sm mb-6">SIP Trunk &amp; DID Platform</p>
        <div className="flex gap-2 mb-6">
          {['login','register'].map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${tab === t ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
              {t === 'login' ? 'Sign In' : 'Sign Up'}
            </button>
          ))}
        </div>
        <form onSubmit={handle} className="space-y-4">
          {tab === 'register' && (
            <input className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500"
              placeholder="Full Name" value={form.name} onChange={e => setForm({...form, name: e.target.value})} required />
          )}
          <input className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500"
            type="email" placeholder="Email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} required />
          <input className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500"
            type="password" placeholder="Password" value={form.password} onChange={e => setForm({...form, password: e.target.value})} required />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg transition">
            {tab === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>
      </div>
    </div>
  )
}
