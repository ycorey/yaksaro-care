'use client'

import { createClient } from '@/lib/supabase/client'

// 약사 헤더용 컴팩트 로그아웃 (퍼지 시퀀스 동일)
export default function PharmacyLogout() {
  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    try { localStorage.removeItem('yc_rx_notif_dismissed') } catch {}
    try { document.cookie = 'pending_pharmacy_id=; Max-Age=0; path=/' } catch {}
    // 하드 내비게이션 — 로그인과 동일 패턴. 소프트 이동(router.push)은 쿠키 삭제와 경쟁해
    // 프록시가 잔여 세션을 보고 role null→'/home'(고객용)으로 튕길 수 있음.
    window.location.href = '/pharmacy/login'
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
