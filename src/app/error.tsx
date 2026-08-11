'use client'

import { useEffect } from 'react'
import { logger } from '@/lib/logger'
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
  useEffect(() => {
    // 수집기가 붙으면(setLogReporter) 이 경로로 자동 전송된다. 지금은 콘솔까지만.
    logger.error('ui', '화면 렌더 실패', error)
  }, [error])

  return (
    <FailureScreen
      title="화면을 불러오지 못했어요"
      body={<>잠시 후 다시 시도해보세요.<br />계속 이 화면이 나오면 문의해주세요.</>}
      detail={error.digest ? `오류 코드 ${error.digest}` : null}
      actions={
        <>
          <FailureAction onClick={reset}>다시 시도</FailureAction>
          <FailureAction href="/home" variant="secondary">홈으로</FailureAction>
        </>
      }
    />
  )
}
