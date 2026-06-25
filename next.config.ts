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
        // 전역 보안 헤더. CSP는 리소스 로딩을 깨지 않는 frame-ancestors(클릭재킹 차단)만 적용 —
        // script-src 등 콘텐츠 제한형 CSP는 Next 인라인 스크립트 nonce 검증 후 별도 도입.
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
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
