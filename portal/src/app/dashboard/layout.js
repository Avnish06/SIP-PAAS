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
      {/* pt-20 on mobile clears the fixed hamburger top bar; min-w-0 lets
          child tables/grids shrink instead of overflowing the viewport. */}
      <main className="flex-1 w-full min-w-0 p-4 pt-20 md:p-8 overflow-auto">{children}</main>
    </div>
  )
}
