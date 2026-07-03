import type { MetadataRoute } from 'next'

// care(앱)의 공개 페이지만. 루트(/)는 랜딩으로 canonical이라 제외.
export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://care.yaksaro.co.kr'
  return [
    { url: `${base}/login`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${base}/privacy`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${base}/terms`, changeFrequency: 'yearly', priority: 0.3 },
  ]
}
