'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

// QR(store_id)로 진입해 로그인한 뒤, 콜백이 쿠키/파라미터 유실로 단골 매핑을 못 한 경우의 안전망.
// 로그인 전 login 페이지가 localStorage에 보관한 store_id를 읽어, 로그인 완료 후(=이 컴포넌트가
// 어느 탭에서든 마운트되면) 서버에 링크 요청한다. localStorage는 같은 브라우저 OAuth 왕복을
// 항상 견뎌서 쿠키/SameSite/Supabase 파라미터 보존에 의존하지 않는다.
const KEY = 'yc_pending_store'

export default function PharmacyLinkFinalizer() {
  const router = useRouter()
  useEffect(() => {
    let store: string | null = null
    try { store = localStorage.getItem(KEY) } catch {}
    if (!store) return
    try { localStorage.removeItem(KEY) } catch {}
    ;(async () => {
      try {
        const res = await fetch('/api/profile/link-store', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ store }),
        })
        const data = await res.json().catch(() => ({}))
        if (data?.linked) {
          toast.success(data.name ? `${data.name}과 연결되었습니다` : '단골 약국이 등록되었습니다')
          router.refresh()
        }
      } catch { /* 조용히 실패 — 사용자는 설정에서 수동 등록 가능 */ }
    })()
  }, [router])

  return null
}
