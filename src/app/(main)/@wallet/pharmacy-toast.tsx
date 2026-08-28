'use client'

import { useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'

// 지갑 착지 알림(약국 연결 + 약 추가). 서버 액션은 redirect만 할 수 있으므로
// "무슨 일이 있었는지"는 쿼리 파라미터로 넘어와 여기서 토스트가 된다.
const ADDED_SECTION: Record<string, { msg: string; anchor: string | null }> = {
  // rx 그룹은 최신순 정렬이라 화면 상단에 이미 보인다 — 스크롤 불필요
  rx:   { msg: '처방의약품 목록에 담았어요', anchor: null },
  // 처방탭인데 병원·일수를 비워 처방 그룹이 안 만들어진 경우 — 약은 일반의약품 섹션에 담기지만
  // 그 약이 전문의약품일 수 있으므로 분류 용어로 선언하지 않는다(앱이 분류를 판정하는 모양 회피).
  'rx-loose': { msg: '복약 목록에 담았어요', anchor: 'sec-otc' },
  // 사용자가 직접 일반의약품 탭을 고른 경우에만 그 이름을 쓴다
  otc:  { msg: '일반의약품 목록에 담았어요', anchor: 'sec-otc' },
  supp: { msg: '영양보조제 목록에 담았어요', anchor: 'sec-supp' },
}

export default function PharmacyToast() {
  const params = useSearchParams()
  const router = useRouter()

  useEffect(() => {
    // ⚠️ setTimeout(0) 필수 — 전체 문서 로드(리다이렉트 착지·새로고침)에서는 이 자식 effect가
    // 루트 레이아웃 <Toaster>의 구독 effect보다 먼저 실행돼(React 는 자식→부모 순),
    // 동기로 쏘면 구독자가 없어 토스트가 조용히 유실된다(2026-08-27 프로브 실측 —
    // 클라이언트 내비게이션에서만 보였다).
    let t: ReturnType<typeof setTimeout> | null = null
    if (params.get('pharmacy_linked') === '1') {
      const name = params.get('pharmacy_name')
      t = setTimeout(() => {
        toast.success(name ? `${name}과 연결되었습니다` : '단골 약국이 등록되었습니다')
        router.replace('/wallet')
      }, 0)
    } else {
      const added = ADDED_SECTION[params.get('added') ?? '']
      if (added) {
        t = setTimeout(() => {
          toast.success(added.msg)
          if (added.anchor) document.getElementById(added.anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          // scroll:false 필수 — 기본값(최상단 스크롤)이 방금 한 scrollIntoView를 되돌린다
          router.replace('/wallet', { scroll: false })
        }, 0)
      }
    }
    return () => { if (t) clearTimeout(t) }
  }, [params, router])

  return null
}
