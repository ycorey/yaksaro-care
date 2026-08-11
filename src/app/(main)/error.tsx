'use client'

import { useEffect } from 'react'
import { logger } from '@/lib/logger'
import FailureScreen, { FailureAction } from '@/components/yc/failure-screen'

// 탭 5종(홈·약지갑·오늘복약·캘린더·전달) 영역의 에러 경계.
//
// 이게 없으면 슬롯 하나가 던질 때 루트 error.tsx 로 올라가 **레이아웃까지 통째로** 대체된다
// — 캘린더 한 곳이 실패했는데 홈·약지갑·오늘복약·전달과 탭바까지 사라진다(10차 UX M2).
// 여기 두면 (main)/layout 의 네비게이션이 살아남아, 사용자는 다른 탭으로 그냥 넘어갈 수 있다.
// 그래서 이 화면의 탈출구는 로그아웃이 아니라 "다시 시도" 다 — 나머지 탭은 멀쩡하다.
export default function MainTabsError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    logger.error('ui', '탭 화면 렌더 실패', error)
  }, [error])

  return (
    <FailureScreen
      title="이 화면을 불러오지 못했어요"
      body={<>잠시 후 다시 시도해보세요.<br />아래 메뉴로 다른 화면은 계속 쓸 수 있어요.</>}
      detail={error.digest ? `오류 코드 ${error.digest}` : null}
      actions={<FailureAction onClick={reset}>다시 시도</FailureAction>}
    />
  )
}
