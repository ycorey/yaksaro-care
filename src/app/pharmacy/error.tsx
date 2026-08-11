'use client'

import { useEffect, useState } from 'react'
import { logger } from '@/lib/logger'
import { signOutAndPurge } from '@/lib/purge'
import FailureScreen, { FailureAction } from '@/components/yc/failure-screen'

// 약사 영역 전용 실패 화면.
//
// 위치가 중요하다 — `(app)/layout.tsx` 가 던진 예외는 **같은 세그먼트의** error.tsx 로는
// 잡히지 않는다(Next 규칙). 그래서 라우트 그룹 바깥인 여기(`pharmacy/error.tsx`)에 둔다.
// 그 레이아웃의 권한 판독 실패 throw 가 정확히 이 경계로 떨어진다.
//
// 루트 error.tsx 를 그대로 쓰면 안 되는 이유: 거기 있는 "홈으로"(/home)는 약사를 다시
// /pharmacy 로 돌려보내 같은 실패를 반복시킨다. 갇힌 약사에게 실제로 필요한 탈출구는
// 로그아웃이다 — 레이아웃이 죽어 헤더가 렌더되지 않으므로 화면 안에 직접 둔다.
export default function PharmacyError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    logger.error('pharmacy', '약사 화면 렌더 실패', error)
  }, [error])

  const handleLogout = async () => {
    setBusy(true)
    await signOutAndPurge()
    // 하드 내비게이션 — 쿠키 삭제와 소프트 이동이 경쟁하면 프록시가 잔여 세션을 보고
    // 되돌려보낸다(pharmacy-logout.tsx 와 동일 사유).
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- 위 사유로 의도된 하드 내비게이션
    window.location.href = '/pharmacy/login'
  }

  return (
    <FailureScreen
      title="약국 화면을 불러오지 못했어요"
      body={<>잠시 후 다시 시도해보세요.<br />계속 이 화면이 나오면 문의해주세요.</>}
      detail={error.digest ? `오류 코드 ${error.digest}` : null}
      actions={
        <>
          <FailureAction onClick={reset}>다시 시도</FailureAction>
          <FailureAction onClick={busy ? undefined : handleLogout} variant="secondary">
            {busy ? '로그아웃 중…' : '로그아웃'}
          </FailureAction>
        </>
      }
    />
  )
}
