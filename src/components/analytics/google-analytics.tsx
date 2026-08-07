'use client'

/**
 * GA4 라이브러리 로드 + 페이지뷰 수동 전송.
 *
 * 초기화(window.gtag 정의·send_page_view:false·기본 page_location)는 루트 <head> 의
 * <GaInit /> 이 이미 끝냈다. 여기서는 gtag.js 를 불러오고, 라우트가 바뀔 때마다
 * **정화된 URL** 로 page_view 를 직접 쏜다.
 *
 * 왜 @next/third-parties 의 <GoogleAnalytics> 를 쓰지 않는가:
 * 그 컴포넌트는 gtag('config', id) 를 옵션 없이 호출해 자동 page_view 를 켠 채로 둔다.
 * 자동 page_view 는 location.href 를 그대로 담으므로 /pharmacy?focus=<환자UUID> 같은
 * URL 이 정화 전에 구글로 나간다.
 */

import Script from 'next/script'
import { Suspense, useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { GA_ID, gtag, sanitizeUrl } from '@/lib/analytics'

function PageViewTracker() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (!GA_ID) return
    const clean = sanitizeUrl(window.location.href)
    if (!clean) return
    // 기본값부터 덮은 뒤 전송 — 순서가 바뀌면 자동 발화가 원본 URL 을 먼저 쓸 수 있다
    gtag('set', { page_location: clean, page_referrer: sanitizeUrl(document.referrer) || undefined })
    gtag('event', 'page_view', { page_location: clean })
  }, [pathname, searchParams])

  return null
}

export default function GoogleAnalytics() {
  if (!GA_ID) return null

  return (
    <>
      <Script
        id="ga-lib"
        strategy="afterInteractive"
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
      />
      {/* useSearchParams 는 Suspense 경계가 필요하다(App Router 필수) */}
      <Suspense fallback={null}>
        <PageViewTracker />
      </Suspense>
    </>
  )
}
