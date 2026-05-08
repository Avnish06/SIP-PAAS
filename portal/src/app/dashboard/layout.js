'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '../../components/Sidebar'

export default function DashboardLayout({ children }) {
  const router = useRouter()
  useEffect(() => {
    if (!localStorage.getItem('sipaas_token')) router.replace('/login')
  }, [])
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-8 overflow-auto">{children}</main>
    </div>
  )
}
