import type { MetadataRoute } from 'next'

// care(앱) 기준 robots. 공개 페이지는 허용, 앱 내부·인증·API 경로는 차단(크롤 예산·리다이렉트 색인 방지).
// 마케팅 SEO는 랜딩(yaksaro.co.kr)이 전담 — 루트는 랜딩으로 canonical(page.tsx).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/dashboard',
        '/wallet',
        '/medications',
        '/profile',
        '/settings',
        '/interactions',
        '/pharmacy',
        '/store/',
        '/api/',
        '/auth/',
        '/offline',
      ],
    },
    sitemap: 'https://care.yaksaro.co.kr/sitemap.xml',
    host: 'https://care.yaksaro.co.kr',
  }
}
