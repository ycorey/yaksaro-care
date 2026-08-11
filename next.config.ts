import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  allowedDevOrigins: ['192.168.0.181', '0.0.0.0', 'localhost'],
  devIndicators: false,
  // 프리페치한 동적 탭을 잠깐 클라 캐시로 재사용 → 탭 전환 시 서버 왕복 없이 즉시 표시.
  // (변경 직후엔 router.refresh()/재진입이 우선하므로 데이터는 곧 갱신됨)
  experimental: {
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
  async headers() {
    return [
      {
        // 전역 보안 헤더.
        //
        // CSP 오리진은 코드·라이브 페이지 실측으로 뽑았다:
        //   googletagmanager(GA 스크립트) · google-analytics(전송) ·
        //   cdn.jsdelivr.net(Pretendard 폰트 CSS+woff2, 버전 고정) ·
        //   nedrug.mfds.go.kr(식약처 약 이미지) · *.supabase.co(API·스토리지)
        //
        // script-src 에 'unsafe-inline' 이 남아 있는 건 Next 인라인 부트스트랩 때문이다.
        // 그래서 이 CSP 의 실익은 XSS 차단보다 **유출 경로 축소**(connect-src·img-src)와
        // 주입 프리미티브 차단(object-src·base-uri·form-action)에 있다.
        // nonce 기반 script-src 는 후속 과제.
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              // 개발 모드에서만 'unsafe-eval' 을 허용한다.
              // Next dev(webpack HMR·소스맵)는 모듈을 eval 로 평가하는데, CSP 가 이를 막으면
              // **하이드레이션 자체가 실패한다** — 화면은 그려지지만 onClick 이 하나도 안 붙어
              // 로컬에서 앱이 통째로 '클릭이 안 되는' 상태가 된다(8/7 CSP 도입 후 그랬다).
              // Playwright e2e 도 dev 서버를 때리므로 상호작용 테스트가 전부 오탐으로 실패했다.
              // 프로덕션 번들은 eval 을 쓰지 않으므로 운영 CSP 는 그대로 둔다(실측: prod 빌드 hydrated).
              process.env.NODE_ENV === 'production'
                ? "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com"
                // va.vercel-scripts.com 은 @vercel/analytics 가 **개발 모드에서만** 불러오는
                // 디버그 스크립트다(운영은 /_vercel/insights 로 자체 전송). 막아두면 콘솔에
                // 상시 빨간 줄이 남는데, 그런 상시 소음이 진짜 에러를 가린다.
                : "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://va.vercel-scripts.com",
              "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
              "font-src 'self' data: https://cdn.jsdelivr.net",
              "img-src 'self' data: blob: https://nedrug.mfds.go.kr https://*.supabase.co https://www.googletagmanager.com https://*.google-analytics.com",
              // Sentry 인제스트를 connect-src 에 넣지 않으면 이벤트가 CSP 로 조용히 차단된다 —
              // "장애를 알아차리는 장치" 가 정작 자기 실패를 못 알리는 상태가 된다.
              "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com https://*.ingest.sentry.io https://*.ingest.us.sentry.io",
              "worker-src 'self'",
              "manifest-src 'self'",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'none'",
            ].join('; '),
          },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // HSTS — preload 지시어는 뺀다(preload 목록 등재는 별도 제출이 필요하고 해제가 느리다).
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
          // OCR 촬영에 카메라 사용 → camera=(self). 그 외 민감 기능은 비활성.
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(self), payment=()' },
        ],
      },
      {
        // no-store는 데이터 API에만 — 페이지/RSC 내비게이션까지 막으면 프리페치가 무력화되어
        // 탭마다 서버를 다시 호출(딜레이)한다. 페이지는 쿠키 기반 dynamic이라 어차피 CDN 미캐시.
        source: '/api/:path*',
        headers: [{ key: 'Cache-Control', value: 'no-store, must-revalidate' }],
      },
    ]
  },
  turbopack: {
    root: __dirname,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
}

export default nextConfig
