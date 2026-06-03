/* 약사로케어 서비스워커 — 의존성 없는 수동 SW
 * 전략:
 *  - 정적 자산(_next/static, icons, fonts): cache-first (빠른 재방문)
 *  - 페이지 이동(navigate): network-first → 실패 시 /offline 폴백 (인증/데이터 신선도 우선)
 *  - 그 외(API 등): 네트워크 통과 (캐시하지 않음 — 약 정보는 항상 최신)
 */
const VERSION = 'v1'
const STATIC_CACHE = `yc-static-${VERSION}`
const PRECACHE = [
  '/offline',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/fonts/Paperlogy-ExtraBold.woff2',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((c) => c.addAll(PRECACHE)).catch(() => {})
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== STATIC_CACHE).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

function isStaticAsset(url) {
  return (
    url.pathname.startsWith('/_next/static') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/fonts/') ||
    url.pathname.startsWith('/brand-assets/')
  )
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return // 외부(이미지 CDN 등)는 통과

  // 1) 정적 자산: cache-first
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then((cached) =>
        cached ||
        fetch(request).then((res) => {
          const copy = res.clone()
          caches.open(STATIC_CACHE).then((c) => c.put(request, copy)).catch(() => {})
          return res
        })
      )
    )
    return
  }

  // 2) 페이지 이동: network-first → 오프라인 시 /offline
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/offline').then((r) => r || new Response('오프라인', { status: 503 })))
    )
    return
  }

  // 3) 그 외(API 등): 그냥 네트워크 (약 정보는 항상 최신 유지)
})

// ── 웹 푸시 수신 → 알림 표시 ──
self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data?.json() ?? {} } catch {}
  const title = data.title || '약사로케어'
  const body = data.body || '약 드실 시간이에요.'
  const url = data.url || '/today'
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/favicon-32.png',
      lang: 'ko',
      vibrate: [80, 40, 80],
      data: { url },
    })
  )
})

// ── 알림 클릭 → 해당 화면으로 포커스/이동 ──
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = event.notification.data?.url || '/today'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const c of clients) {
        if ('focus' in c) { c.navigate(target); return c.focus() }
      }
      return self.clients.openWindow(target)
    })
  )
})
