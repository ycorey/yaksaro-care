'use client'

import { useSyncExternalStore } from 'react'

// 분 단위 현재 시각 훅. SSR/하이드레이션 시 null(서버시간과 클라 KST 불일치 #418 방지),
// 마운트 후에만 실제 시각을 노출한다. useSyncExternalStore 기반이라
// effect 내 동기 setState(react-hooks/set-state-in-effect) 없이 클라 전용 시계를 구독한다.
function subscribe(onChange: () => void) {
  const id = setInterval(onChange, 60_000)
  return () => clearInterval(id)
}

// 분 단위로 버킷팅 → 같은 분 안에서는 동일 값 반환(useSyncExternalStore 무한 렌더 방지)
function getSnapshot(): number | null {
  return Math.floor(Date.now() / 60_000)
}

// 서버/하이드레이션 스냅샷은 null → 첫 페인트는 시간 비의존, 마운트 후 실제 시각으로 재렌더
function getServerSnapshot(): number | null {
  return null
}

export function useNowMinute(): Date | null {
  const bucket = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  return bucket === null ? null : new Date(bucket * 60_000)
}
