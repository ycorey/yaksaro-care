/**
 * 복약 알림 — 웹 Notification API 기반.
 *
 * ⚠️ 한계: 웹에서 "매일 8시" 같은 진짜 백그라운드 예약 알림은
 *   - Push API + 백엔드 푸시 서버(VAPID/web-push) 또는
 *   - Notification Triggers API(실험적, 크롬 한정)
 * 가 있어야 한다. 현재는 ① 권한 획득 ② 즉시/포그라운드 알림 표시까지 지원한다.
 *   (앱이 열려 있는 동안의 복약시간 리마인드 + 설치형 PWA에서의 확인 알림)
 * 추후 백엔드 푸시 도입 시 이 모듈에 subscribe/scheduling을 추가한다.
 */

export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  if (!isNotificationSupported()) return 'unsupported'
  return Notification.permission
}

/** 권한 요청 — 사용자 제스처(토글 클릭) 안에서 호출해야 함 */
export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!isNotificationSupported()) return 'unsupported'
  if (Notification.permission === 'granted') return 'granted'
  try {
    return await Notification.requestPermission()
  } catch {
    return Notification.permission
  }
}

/** 알림 표시 — 서비스워커 등록 시 SW로, 아니면 직접 */
export async function showLocalNotification(
  title: string,
  options: NotificationOptions & { url?: string } = {}
): Promise<boolean> {
  if (!isNotificationSupported() || Notification.permission !== 'granted') return false
  const { url, ...rest } = options
  const opts: NotificationOptions = {
    icon: '/icons/icon-192.png',
    badge: '/icons/favicon-32.png',
    lang: 'ko',
    data: { url: url ?? '/today' },
    ...rest,
  }
  try {
    const reg = await navigator.serviceWorker?.ready
    if (reg) { await reg.showNotification(title, opts); return true }
    new Notification(title, opts)
    return true
  } catch {
    return false
  }
}
