'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function DashboardPoll() {
  const router = useRouter()
  useEffect(() => {
    const id = setInterval(() => router.refresh(), 30000)
    return () => clearInterval(id)
  }, [router])
  return null
}
