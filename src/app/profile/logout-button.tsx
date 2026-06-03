'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LogoutButton() {
  const router = useRouter()

  const handleLogout = async () => {
    const supabase = createClient()

    // ── 개인정보 퍼지(Purge) 시퀀스 ─────────────────────────────────────
    // 공용 기기·자녀 폰 등에서 로그아웃 시 복약 체크·세션 잔재가 남으면 안 된다.
    // 1) Supabase 세션 무효화 (서버 토큰 파기)
    await supabase.auth.signOut()

    // 2) 브라우저 로컬 스토리지 전체 초기화 (복약 체크 이력, 캐시 등 일괄 삭제)
    try { localStorage.clear() } catch {}

    // 3) 단골약국 QR 잔여 쿠키 삭제
    try {
      document.cookie = 'pending_pharmacy_id=; Max-Age=0; path=/'
    } catch {}

    router.push('/login')
    router.refresh()
  }

  return (
    <button
      onClick={handleLogout}
      className="w-full px-5 py-4 text-left text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
    >
      로그아웃
    </button>
  )
}
