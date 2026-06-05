// 화면 전환을 "옛 화면 + 새 화면이 한 장처럼 함께 슬라이드"로 만드는 헬퍼.
// 브라우저 네이티브 View Transitions API(document.startViewTransition)를 사용한다.
//  · 미지원 브라우저(예: iOS 17 이하)는 즉시 이동으로 우아하게 퇴화.
//  · 방향(fwd/back)은 <html data-vt="..."> 로 내보내 CSS가 좌/우 슬라이드를 고른다.
//  · startViewTransition 콜백은 "새 라우트가 커밋될 때까지" 대기해야 새 화면 스냅샷이
//    제대로 잡힌다 → pending resolver를 두고, RouteTransition이 경로 변경 시 resolve.

const TAB_ORDER = ['/home', '/wallet', '/today', '/calendar', '/share']

function tabIndex(path: string): number {
  return TAB_ORDER.findIndex(t => path === t || path.startsWith(t + '/'))
}

function direction(from: string, to: string): 'fwd' | 'back' {
  const a = tabIndex(from)
  const b = tabIndex(to)
  if (a >= 0 && b >= 0) return b > a ? 'fwd' : 'back' // 탭↔탭: 인덱스 순서
  if (b < 0) return 'fwd'                              // 탭 → 상세(더 깊이)
  return 'back'                                        // 상세 → 탭(뒤로)
}

let pending: (() => void) | null = null
let safetyTimer: ReturnType<typeof setTimeout> | null = null

// 새 라우트 커밋 시 호출 → 대기 중인 뷰 트랜지션을 완료(새 화면 스냅샷 확정)
export function resolvePendingTransition() {
  if (safetyTimer) { clearTimeout(safetyTimer); safetyTimer = null }
  if (pending) { const p = pending; pending = null; p() }
}

type PushRouter = { push: (href: string) => void }

export function navigateWithTransition(router: PushRouter, from: string, href: string) {
  if (href === from) return

  // 미지원 브라우저(iOS 17 이하 등) → 즉시 이동. (DOM 타입엔 항상 선언돼 있어 런타임 체크 필요)
  if (typeof document.startViewTransition !== 'function') {
    router.push(href)
    return
  }

  document.documentElement.dataset.vt = direction(from, href)
  const transition = document.startViewTransition(
    () =>
      new Promise<void>(resolve => {
        pending = resolve
        // 네비게이션이 어떤 이유로 커밋 신호를 못 주면 트랜지션이 멈추지 않도록 안전망
        safetyTimer = setTimeout(resolvePendingTransition, 700)
        router.push(href)
      }),
  )
  transition.finished.finally(() => {
    delete document.documentElement.dataset.vt
  })
}
