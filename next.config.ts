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
