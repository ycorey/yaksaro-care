'use client'

import { useEffect } from 'react'

/**
 * 서비스워커 등록 — 설치 가능(PWA) + 오프라인 캐시 활성화.
 * 프로덕션에서만 등록(개발 중 SW 캐시로 인한 혼란 방지).
 */
export default function PWARegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return
    if (process.env.NODE_ENV !== 'production') return

    const onLoad = () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .catch((e) => console.warn('[PWA] SW 등록 실패:', e))
    }
    window.addEventListener('load', onLoad)
    return () => window.removeEventListener('load', onLoad)
  }, [])

  return null
}
