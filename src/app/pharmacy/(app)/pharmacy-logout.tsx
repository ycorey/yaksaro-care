'use client'

import { signOutAndPurge } from '@/lib/purge'

// 약사 헤더용 컴팩트 로그아웃 (퍼지 시퀀스는 lib/purge 가 SSOT)
export default function PharmacyLogout() {
  const handleLogout = async () => {
    await signOutAndPurge()
    // 하드 내비게이션 — 로그인과 동일 패턴. 소프트 이동(router.push)은 쿠키 삭제와 경쟁해
    // 프록시가 잔여 세션을 보고 role null→'/home'(고객용)으로 튕길 수 있음.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- 위 사유로 의도된 하드 내비게이션
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
