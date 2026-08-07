'use client'

import { useRouter } from 'next/navigation'
import { signOutAndPurge } from '@/lib/purge'

export default function LogoutButton() {
  const router = useRouter()

  const handleLogout = async () => {
    // 퍼지 시퀀스(푸시 해제 → 세션 무효화 → 로컬 상태 파기)는 lib/purge 가 SSOT.
    // 공용 기기·자녀 폰에서 계정이 바뀔 때 이전 사용자 흔적이 남으면 안 된다.
    await signOutAndPurge()

    router.push('/login')
    router.refresh()
  }

  return (
    <button
      onClick={handleLogout}
      className="w-full px-5 py-4 text-left text-sm font-medium text-yc-error active:bg-yc-errorBg transition-colors"
    >
      로그아웃
    </button>
  )
}
