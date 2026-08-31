import type { MetadataRoute } from 'next'

// care(앱)의 공개 페이지만. 루트(/)는 랜딩으로 canonical이라 제외.
export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://care.yaksaro.co.kr'
  return [
    { url: `${base}/login`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${base}/privacy`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${base}/terms`, changeFrequency: 'yearly', priority: 0.3 },
    // Play Data safety 의 계정 삭제 요청 URL — 심사자가 색인 없이도 열 수 있어야 하고,
    // 공개 페이지임을 robots/sitemap 양쪽에서 일관되게 선언한다.
    { url: `${base}/account-deletion`, changeFrequency: 'yearly', priority: 0.3 },
  ]
}
