/**
 * 디자인 토큰을 단일 출처로 사용하는 색 상수.
 * globals.css의 @theme 토큰(--color-yc-*)을 런타임에 읽어, 화면 코드에 hex를
 * 하드코딩하지 않는다. SSR/미정의 대비 fallback hex만 동일 토큰값으로 둔다.
 */
function cssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

/** 색종이 색 4종 — green600 / lime300 / blue500 / warning (핸드오프 confetti 스펙) */
export function confettiColors(): string[] {
  return [
    cssVar('--color-yc-green600', '#0E6E54'),
    cssVar('--color-yc-lime300',  '#D9F25C'),
    cssVar('--color-yc-blue500',  '#4A8FCC'),
    cssVar('--color-yc-warning',  '#E8A817'),
  ]
}

/**
 * 전체 복약 완료 축하 — 화면 상단에서 색종이가 쏟아진다.
 * Today 화면의 "오늘 복약 끝!" 오버레이와 함께 호출한다.
 */
export async function celebrateAllDone(): Promise<void> {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  // canvas-confetti는 호출 시점에 동적 로드 → 초기 번들에서 제외(코드분할)
  const confetti = (await import('canvas-confetti')).default
  const colors = confettiColors()
  const end = Date.now() + 900

  // 좌우 양쪽에서 살짝 위로 터뜨려 위에서 떨어지는 느낌
  ;(function frame() {
    confetti({ particleCount: 5, angle: 60,  spread: 55, origin: { x: 0 },   colors })
    confetti({ particleCount: 5, angle: 120, spread: 55, origin: { x: 1 },   colors })
    confetti({ particleCount: 4, angle: 90,  spread: 70, origin: { x: 0.5, y: 0 }, colors })
    if (Date.now() < end) requestAnimationFrame(frame)
  })()
}
