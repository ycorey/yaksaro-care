'use client'

import { useEffect } from 'react'
import { logger } from '@/lib/logger'
import FailureScreen, { FailureAction } from '@/components/yc/failure-screen'

// 약사 **페이지** 실패용 경계.
//
// 이게 없으면 QR 화면 하나가 던져도 그룹 바깥의 pharmacy/error.tsx 가 잡는데, 거기는
// **레이아웃이 죽었을 때** 를 상정한 화면이라 헤더가 사라지고 남는 선택지가 "로그아웃" 뿐이다
// — QR 한 화면 실패에 로그아웃을 권하는 꼴이 된다(10차 UX M3).
//
// 여기서 잡으면 레이아웃(헤더·약국명)은 살아 있으므로 대시보드로 돌아가면 그만이다.
// 권한 판정이 실패한 경우는 여전히 layout 이 던지고 바깥 경계가 받는다 — 역할이 나뉜다.
export default function PharmacyPageError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    logger.error('pharmacy', '약사 페이지 렌더 실패', error)
  }, [error])

  return (
    <FailureScreen
      title="이 화면을 불러오지 못했어요"
      body={<>잠시 후 다시 시도해보세요.<br />대시보드는 계속 쓸 수 있어요.</>}
      detail={error.digest ? `오류 코드 ${error.digest}` : null}
      actions={
        <>
          <FailureAction onClick={reset}>다시 시도</FailureAction>
          <FailureAction href="/pharmacy" variant="secondary">대시보드로</FailureAction>
        </>
      }
    />
  )
}
