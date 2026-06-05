'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// 약사 헤더용 컴팩트 로그아웃 (퍼지 시퀀스 동일)
export default function PharmacyLogout() {
  const router = useRouter()

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    try { localStorage.clear() } catch {}
    try { document.cookie = 'pending_pharmacy_id=; Max-Age=0; path=/' } catch {}
    router.push('/pharmacy/login')
    router.refresh()
  }

  return (
    <button
      onClick={handleLogout}
      className="text-sm font-medium text-yc-neutral500 active:text-yc-error px-2 py-1 rounded-yc-sm"
    >
      로그아웃
    </button>
  )
}
