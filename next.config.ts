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
              "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com",
              "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
              "font-src 'self' data: https://cdn.jsdelivr.net",
              "img-src 'self' data: blob: https://nedrug.mfds.go.kr https://*.supabase.co https://www.googletagmanager.com https://*.google-analytics.com",
              "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com",
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
