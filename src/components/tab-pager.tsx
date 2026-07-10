'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * 탭 페이저 — 5개 탭(병렬 슬롯)을 가로 트랙에 나란히 두고, 손가락을 따라 한 장처럼 넘긴다.
 *  · 인접 탭이 항상 마운트돼 있어(끌림/깜빡임 없음) 진짜 네이티브 페이저 느낌.
 *  · 각 패널은 세로 독립 스크롤(스크롤 위치 보존). 가로는 우리가, 세로는 브라우저가 처리(touch-action: pan-y).
 *  · displayIndex로 트랙 위치를 관리 → 드래그/스냅/탭클릭(URL변화)이 매끄럽게 합쳐진다.
 */
const TABS = ['/home', '/wallet', '/today', '/calendar', '/share'] as const
const TAB_LABELS = ['홈', '약지갑', '오늘복약', '캘린더', '전달'] as const

function indexOf(pathname: string): number {
  const i = TABS.findIndex(t => pathname === t || pathname.startsWith(t + '/'))
  return i < 0 ? 0 : i
}

type Props = {
  home: ReactNode
  wallet: ReactNode
  today: ReactNode
  calendar: ReactNode
  share: ReactNode
}

export default function TabPager({ home, wallet, today, calendar, share }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const activeIndex = indexOf(pathname)
  const panels = [home, wallet, today, calendar, share]

  const [displayIndex, setDisplayIndex] = useState(activeIndex)
  const [dragX, setDragX] = useState(0)
  const [dragging, setDragging] = useState(false)

  const viewportRef = useRef<HTMLDivElement>(null)
  const gesture = useRef<{
    x: number; y: number; w: number
    axis: 'h' | 'v' | null
    lastX: number; lastT: number; vx: number
  } | null>(null)

  // URL이 바뀌면(탭 클릭·뒤로가기·QR 등) 트랙을 그 탭으로 애니메이션
  // — effect 대신 렌더 중 상태 조정 패턴(공식 권장): 커밋 전에 반영돼 깜빡임도 없다
  const [prevActiveIndex, setPrevActiveIndex] = useState(activeIndex)
  if (prevActiveIndex !== activeIndex) {
    setPrevActiveIndex(activeIndex)
    setDisplayIndex(activeIndex)
  }

  // 인접 탭 프리페치(빈 page.tsx라 가볍지만, 슬롯은 이미 마운트돼 전환은 즉시)
  useEffect(() => {
    for (const t of TABS) router.prefetch(t)
  }, [router])

  // 최초 1회 스와이프 힌트 — 트랙을 살짝 밀었다 되돌려 "옆으로 넘길 수 있음"을 알린다.
  // 터치 기기에서만, localStorage 플래그로 재노출 방지. 키프레임이 translateX(0) 기준이라 index 0에서만.
  const [hint, setHint] = useState(false)
  useEffect(() => {
    let showId: ReturnType<typeof setTimeout> | undefined
    let hideId: ReturnType<typeof setTimeout> | undefined
    try {
      if (!window.matchMedia('(pointer: coarse)').matches) return
      if (localStorage.getItem('yc_swipe_hint')) return
      localStorage.setItem('yc_swipe_hint', '1')
      showId = setTimeout(() => setHint(true), 400)
      hideId = setTimeout(() => setHint(false), 2200)
    } catch { /* localStorage 접근 불가(시크릿 등) — 힌트 생략 */ }
    return () => { clearTimeout(showId); clearTimeout(hideId) }
  }, [])

  // 좌측 엣지는 브라우저 뒤로가기 스와이프에 양보 (iOS 엣지 제스처 충돌 방지)
  const EDGE_DEADZONE = 24

  function onTouchStart(e: React.TouchEvent) {
    if (hint) setHint(false) // 힌트 재생 중 터치 → 즉시 원위치
    if (e.touches.length !== 1) { gesture.current = null; return }
    const t = e.touches[0]
    if (t.clientX < EDGE_DEADZONE) { gesture.current = null; return }
    // 가로 스크롤 UI(칩 슬라이더 등)는 data-pager-ignore 조상 지정으로 페이저 제스처에서 제외
    if ((e.target as HTMLElement).closest?.('[data-pager-ignore]')) { gesture.current = null; return }
    const w = viewportRef.current?.clientWidth ?? window.innerWidth
    gesture.current = { x: t.clientX, y: t.clientY, w, axis: null, lastX: t.clientX, lastT: Date.now(), vx: 0 }
  }

  function onTouchMove(e: React.TouchEvent) {
    const g = gesture.current
    if (!g) return
    const t = e.touches[0]
    const dx = t.clientX - g.x
    const dy = t.clientY - g.y

    // 축 결정(가로/세로) — 세로면 이후 무시(네이티브 스크롤에 양보)
    if (g.axis === null) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return
      g.axis = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'h' : 'v'
      if (g.axis === 'h') setDragging(true)
    }
    if (g.axis !== 'h') return

    // 속도(플릭) 추적
    const now = Date.now()
    const dt = now - g.lastT
    if (dt > 0) g.vx = (t.clientX - g.lastX) / dt // px/ms
    g.lastX = t.clientX
    g.lastT = now

    // 가장자리 저항(고무줄)
    let d = dx
    const atStart = displayIndex === 0 && d > 0
    const atEnd = displayIndex === TABS.length - 1 && d < 0
    if (atStart || atEnd) d = d / 3
    setDragX(d)
  }

  function onTouchEnd() {
    const g = gesture.current
    gesture.current = null
    setDragging(false)
    if (!g || g.axis !== 'h') { setDragX(0); return }

    const distThreshold = Math.min(72, g.w * 0.22)
    const flick = Math.abs(g.vx) > 0.35 // px/ms

    let target = displayIndex
    const wantNext = dragX <= -distThreshold || (flick && g.vx < 0)
    const wantPrev = dragX >= distThreshold || (flick && g.vx > 0)
    if (wantNext && displayIndex < TABS.length - 1) target = displayIndex + 1
    else if (wantPrev && displayIndex > 0) target = displayIndex - 1

    setDragX(0)
    if (target !== displayIndex) {
      setDisplayIndex(target)   // 즉시 그 탭으로 애니메이션(낙관적)
      router.push(TABS[target]) // URL 동기화 — 슬롯은 유지돼 재요청 없음
    }
  }

  const trackStyle: React.CSSProperties = {
    transform: `translateX(calc(${-displayIndex * 100}% + ${dragX}px))`,
    transition: dragging ? 'none' : 'transform 360ms cubic-bezier(0.22, 0.66, 0.16, 1)',
  }

  return (
    <div
      ref={viewportRef}
      className="md:ml-64 overflow-hidden"
      style={{ height: '100dvh' }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <div className={`flex h-full ${hint && displayIndex === 0 && !dragging ? 'anim-swipe-hint' : ''}`} style={trackStyle}>
        {panels.map((panel, i) => (
          <div
            key={TABS[i]}
            className="shrink-0 w-full h-full overflow-y-auto overflow-x-hidden yc-noscrollbar bg-background"
            style={{ touchAction: 'pan-y', WebkitOverflowScrolling: 'touch' }}
          >
            <div className="max-w-[430px] mx-auto px-4 pt-5 pb-28">{panel}</div>
          </div>
        ))}
      </div>

      {/* 페이지 도트 — 현재 위치 + "옆으로 넘길 수 있음" 표시. 눌러도 이동하도록 최소 핸들러 부여
          (실버가 페이지네이션 컨트롤로 오인해 탭했을 때 무반응이면 "고장"으로 읽힘 — 7차 M1) */}
      <div
        className="md:hidden fixed left-0 right-0 z-40 flex justify-center"
        style={{ bottom: 'calc(70px + env(safe-area-inset-bottom))' }}
      >
        {TABS.map((t, i) => (
          <button
            key={t}
            type="button"
            onClick={() => { if (i !== displayIndex) { setDisplayIndex(i); router.push(t) } }}
            aria-label={`${TAB_LABELS[i]} 탭으로 이동`}
            aria-current={i === displayIndex ? 'page' : undefined}
            className="p-2 flex items-center justify-center"
          >
            <span
              className={`rounded-full transition-colors duration-300 ${
                i === displayIndex ? 'w-4 h-1.5 bg-yc-green600' : 'w-1.5 h-1.5 bg-yc-neutral300'
              }`}
            />
          </button>
        ))}
      </div>
    </div>
  )
}
