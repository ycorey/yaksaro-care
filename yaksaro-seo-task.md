# 약사로(yaksaro.co.kr) SEO 색인 문제 해결 작업 지시서

## 배경

`yaksaro.co.kr`는 Next.js 기반 사이트다. 현재 두 가지 문제가 있다.

1. **구글**: Search Console에서 `'NOINDEX' 태그에 의해 제외되었습니다` 1건, `발견됨 - 현재 색인이 생성되지 않음` 상태. 색인된 페이지가 2개 수준으로 매우 적다.
2. **네이버**: 서치어드바이저에 사이트가 등록되어 있지 않아 한글 "약사로" 검색 시 노출이 전혀 안 된다. 현재 소유확인 단계 진행 중.

정식(canonical) 주소는 **`https://yaksaro.co.kr`** (https, www 없음)이다.

아래 작업을 순서대로 수행하고, 각 단계마다 무엇을 바꿨는지 보고해줘.

---

## 작업 1. NOINDEX 태그 색출 및 제거

Search Console이 noindex로 차단된 페이지 1건을 보고하고 있다. 원인을 찾아 제거해야 한다.

### 1-1. 코드베이스 전체 검색

다음 패턴을 **모두** 찾아서 파일 경로와 함께 목록화해줘.

- `noindex`
- `robots` (metadata 객체 내 설정)
- `X-Robots-Tag`
- `NEXT_PUBLIC_` 환경변수로 robots를 제어하는 로직

확인해야 할 위치:

- `app/**/layout.tsx`, `app/**/page.tsx` 의 `export const metadata`
- `pages/_document.tsx`, `pages/_app.tsx` 의 `<meta name="robots">`
- `next.config.js` / `next.config.mjs` 의 `headers()` 함수
- `middleware.ts` 에서 응답 헤더를 조작하는 코드
- `public/robots.txt`
- Vercel 배포 중이라면 `vercel.json` 의 `headers` 설정

### 1-2. 판단 기준

찾은 noindex가 **의도적인 것인지 실수인지** 구분해서 보고해줘.

- **유지해야 할 것**: 관리자 페이지, 로그인 페이지, 개인정보 관련 페이지, 검색 결과 페이지, 프리뷰/스테이징 전용 경로
- **제거해야 할 것**: 홈, 서비스 소개, 약국 대상 페이지, 환자 대상 페이지 등 공개 랜딩 페이지

특히 **개발 중 임시로 걸어둔 전역 noindex가 프로덕션에 남아있는 경우**를 의심해봐. 예를 들어 이런 코드:

```ts
// 이런 패턴이 있으면 프로덕션에서 문제
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};
```

또는 환경변수 분기가 프로덕션에서 잘못 평가되는 경우:

```ts
robots: process.env.VERCEL_ENV !== "production"
  ? { index: false }
  : { index: true },
```

### 1-3. 조치

공개되어야 할 페이지의 noindex를 제거하고, 루트 레이아웃에 명시적으로 색인 허용을 선언해줘.

```ts
// app/layout.tsx
export const metadata: Metadata = {
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};
```

---

## 작업 2. 네이버 서치어드바이저 소유확인 파일 배치

네이버 서치어드바이저에서 두 개 주소를 등록할 예정이다. 각 주소마다 **서로 다른 이름의 확인 파일**이 발급된다.

| 등록 주소 | 확인 파일명 |
|---|---|
| `https://yaksaro.co.kr` | (등록 후 발급 — 사용자가 전달) |
| `http://www.yaksaro.co.kr` | `naverf75c6eb221961fd723c12770c4cf0f1c.html` |

### 조치

발급받은 `.html` 확인 파일을 **`public/` 폴더 최상단**에 그대로 배치해줘. Next.js는 `public/` 내 파일을 루트 경로로 서빙하므로 별도 라우팅 설정이 필요 없다.

```
public/
├── naverf75c6eb221961fd723c12770c4cf0f1c.html
├── naver{메인주소용_해시}.html
├── robots.txt
└── sitemap.xml
```

파일 내용은 네이버가 발급한 그대로 유지해야 한다 (보통 `naver-site-verification: naverXXXX.html` 한 줄).

**중요**: `middleware.ts`가 있다면 이 `.html` 경로들이 미들웨어에 가로채이지 않도록 `matcher`에서 제외해줘.

```ts
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|naver.*\\.html).*)"],
};
```

---

## 작업 3. robots.txt 점검

`public/robots.txt`를 확인하고, 없으면 생성해줘. 네이버 크롤러 `Yeti`가 차단되어 있으면 반드시 허용으로 바꿔야 한다.

목표 상태:

```
User-agent: *
Allow: /

User-agent: Yeti
Allow: /

User-agent: Googlebot
Allow: /

Sitemap: https://yaksaro.co.kr/sitemap.xml
```

`Disallow: /` 가 전역으로 걸려 있으면 그게 색인 실패의 직접 원인이다. 발견 시 즉시 보고해줘.

관리자/API 경로만 선별적으로 막고 싶다면 `Disallow: /admin/`, `Disallow: /api/` 처럼 경로를 명시해줘.

---

## 작업 4. sitemap.xml 점검 및 생성

`https://yaksaro.co.kr/sitemap.xml` 이 정상적인 XML을 반환하는지 확인해줘.

### App Router인 경우

`app/sitemap.ts`로 동적 생성하는 것을 권장한다.

```ts
import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://yaksaro.co.kr";
  const routes = ["", "/care", "/pharmacy", "/about"]; // 실제 라우트로 교체

  return routes.map((route) => ({
    url: `${base}${route}`,
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority: route === "" ? 1 : 0.8,
  }));
}
```

실제 존재하는 공개 라우트를 코드베이스에서 직접 스캔해서 목록을 채워줘. 존재하지 않는 URL이 사이트맵에 들어가면 오히려 감점이다.

### 확인 사항

- 사이트맵 내 URL이 전부 `https://yaksaro.co.kr` (www 없음)로 통일되어 있는지
- noindex 페이지가 사이트맵에 포함되어 있지 않은지 (모순 신호가 됨)

---

## 작업 5. 한글 검색 대응 메타데이터 강화

"약사로"로 한글 검색 시 노출되게 하려면 브랜드명이 구조적으로 명확해야 한다.

### 5-1. 루트 메타데이터

```ts
// app/layout.tsx
export const metadata: Metadata = {
  metadataBase: new URL("https://yaksaro.co.kr"),
  title: {
    default: "약사로 — 약과 사람을 잇는 길",
    template: "%s | 약사로",
  },
  description:
    "복약 관리부터 약국 연결까지. 약사가 직접 만드는 헬스케어 플랫폼 약사로입니다.",
  keywords: ["약사로", "복약관리", "약국", "약사", "헬스케어 플랫폼", "처방전 관리"],
  alternates: {
    canonical: "https://yaksaro.co.kr",
  },
  openGraph: {
    type: "website",
    locale: "ko_KR",
    url: "https://yaksaro.co.kr",
    siteName: "약사로",
    title: "약사로 — 약과 사람을 잇는 길",
    description: "복약 관리부터 약국 연결까지. 약사가 직접 만드는 헬스케어 플랫폼",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "약사로" }],
  },
};
```

### 5-2. html lang 속성

`<html lang="ko">` 로 설정되어 있는지 확인해줘. `en`으로 되어 있으면 한글 검색 노출에 불리하다.

### 5-3. Organization 구조화 데이터

브랜드명 "약사로"를 검색엔진이 고유명사로 인식하게 만드는 핵심 작업이다. 루트 레이아웃에 JSON-LD를 삽입해줘.

```tsx
// app/layout.tsx 의 <body> 내부
<script
  type="application/ld+json"
  dangerouslySetInnerHTML={{
    __html: JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "약사로",
      alternateName: ["Yaksaro", "약사로 케어"],
      url: "https://yaksaro.co.kr",
      logo: "https://yaksaro.co.kr/logo.png",
      description:
        "복약 관리부터 약국 연결까지, 약사가 직접 만드는 헬스케어 플랫폼",
      sameAs: [
        // 운영 중인 SNS/블로그 URL이 있으면 추가
      ],
    }),
  }}
/>
```

### 5-4. h1 태그 확인

각 페이지에 `<h1>`이 정확히 하나씩 있고, 홈페이지 `<h1>`에 "약사로"라는 단어가 텍스트로 포함되어 있는지 확인해줘. 이미지 로고만 있고 텍스트 `<h1>`이 없으면 검색엔진이 브랜드명을 읽지 못한다.

---

## 작업 6. 렌더링 방식 점검

네이버 크롤러(`Yeti`)는 구글에 비해 **JavaScript 렌더링 처리가 약하다.** 클라이언트 사이드에서만 그려지는 콘텐츠는 네이버가 읽지 못할 가능성이 높다.

### 확인

- 홈페이지가 `"use client"` 전용 컴포넌트로만 구성되어 있는지
- 주요 텍스트 콘텐츠가 SSR/SSG 결과물(HTML 소스)에 실제로 포함되는지

### 검증 방법

```bash
npm run build && npm start
# 다른 터미널에서
curl -s http://localhost:3000 | grep -o "약사로" | wc -l
```

빌드된 HTML에 핵심 텍스트가 안 보이면, 해당 섹션을 서버 컴포넌트로 전환하거나 최소한 첫 화면 콘텐츠는 SSR되도록 리팩터링해줘.

---

## 작업 7. www / non-www 처리 확인

`www.yaksaro.co.kr` 와 `yaksaro.co.kr` 가 **양쪽 다 200으로 콘텐츠를 반환**하고 있다. 중복 콘텐츠 문제가 될 수 있다.

### 권장 처리

- 모든 페이지의 canonical 태그가 `https://yaksaro.co.kr` (www 없음)를 가리키도록 통일
- 네이버 소유확인이 **완료된 후**, `www` → non-www 301 리다이렉트 적용 검토

**주의**: 소유확인 전에 리다이렉트를 걸면 네이버가 `http://www.yaksaro.co.kr` 의 확인 파일을 못 찾아 검증에 실패할 수 있다. **반드시 두 주소 모두 소유확인을 통과시킨 다음** 리다이렉트를 적용해줘.

리다이렉트 적용 시 (`next.config.js`):

```js
module.exports = {
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.yaksaro.co.kr" }],
        destination: "https://yaksaro.co.kr/:path*",
        permanent: true,
      },
    ];
  },
};
```

---

## 작업 8. 최종 검증

배포 후 아래를 순서대로 확인하고 결과를 표로 보고해줘.

| 항목 | 확인 방법 | 기대 결과 |
|---|---|---|
| 네이버 확인 파일 | `https://yaksaro.co.kr/naverXXXX.html` 접속 | 200, 인증 문자열 표시 |
| robots.txt | `https://yaksaro.co.kr/robots.txt` | Yeti·Googlebot 허용, Sitemap 라인 존재 |
| sitemap.xml | `https://yaksaro.co.kr/sitemap.xml` | 유효한 XML, 모든 URL이 non-www https |
| noindex 잔존 | 빌드 결과물에서 `noindex` 검색 | 공개 페이지에 없음 |
| canonical | 홈 HTML 소스 확인 | `https://yaksaro.co.kr` |
| lang 속성 | 홈 HTML 소스 확인 | `<html lang="ko">` |
| SSR 콘텐츠 | `curl`로 HTML 확인 | 핵심 텍스트 포함 |
| JSON-LD | 홈 HTML 소스 확인 | Organization 스키마 존재 |

---

## 작업 범위 밖 (사용자가 직접 수행)

아래는 로그인이 필요해 코드로 처리할 수 없다. 작업 완료 후 사용자에게 안내만 해줘.

1. **네이버 서치어드바이저** — 사이트 등록 → 소유확인 클릭 → `요청 > 사이트맵 제출` → `요청 > 웹페이지 수집`
2. **구글 서치콘솔** — `URL 검사` → `색인 생성 요청`, `Sitemaps` 메뉴에서 사이트맵 제출

---

## 주의사항

- **커밋 전 반드시 빌드가 통과하는지 확인**할 것
- 네이버 확인 파일은 **내용을 절대 수정하지 말 것** (한 글자만 달라도 검증 실패)
- 기존에 의도적으로 설정된 noindex(관리자 페이지 등)는 **함부로 제거하지 말고 먼저 물어볼 것**
- 실제 라우트 구조를 확인하지 않고 사이트맵에 추측성 URL을 넣지 말 것
