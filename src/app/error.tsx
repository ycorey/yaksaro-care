'use client'

import { useEffect, useState } from 'react'
import { logger } from '@/lib/logger'
import { signOutAndPurge } from '@/lib/purge'
import FailureScreen, { FailureAction } from '@/components/yc/failure-screen'

// 라우트 세그먼트 에러 경계. 이게 없으면 Next 기본 영문 "Application error" 화면이 뜬다.
//
// 9차 평가가 잡은 구멍: 저장소 전역에 error.tsx 가 0개였다. 그래서 어떤 서버 컴포넌트가
// 던지든 사용자는 영어 화면에 이동 수단 없이 갇혔다 — 설치형 PWA 는 주소창도 없다.
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    // 수집기가 붙으면(setLogReporter) 이 경로로 자동 전송된다. 지금은 콘솔까지만.
    logger.error('ui', '화면 렌더 실패', error)
  }, [error])

  // 이 화면에 닿는 주 경로는 (main) — 즉 "홈으로" 가 방금 실패한 그 자리다.
  // pharmacy/error.tsx 에는 그 이유로 로그아웃을 뒀는데 여기엔 빠져 있었다(10차 UX H3).
  // 계정 상태가 꼬여 (main) 이 매번 던지는 경우(예: 멤버 조회 실패) 탈출 수단이 0이 된다.
  const handleLogout = async () => {
    setBusy(true)
    await signOutAndPurge()
    // 하드 내비게이션 — 쿠키 삭제와 소프트 이동이 경쟁하면 프록시가 되돌려보낸다.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- 위 사유로 의도된 하드 내비게이션
    window.location.href = '/login'
  }

  return (
    <FailureScreen
      title="화면을 불러오지 못했어요"
      body={<>잠시 후 다시 시도해보세요.<br />계속 이 화면이 나오면 문의해주세요.</>}
      detail={error.digest ? `오류 코드 ${error.digest}` : null}
      actions={
        <>
          <FailureAction onClick={reset}>다시 시도</FailureAction>
          <FailureAction href="/home" variant="secondary">홈으로</FailureAction>
          <FailureAction onClick={busy ? undefined : handleLogout} variant="secondary">
            {busy ? '로그아웃 중…' : '로그아웃'}
          </FailureAction>
        </>
      }
    />
  )
}
