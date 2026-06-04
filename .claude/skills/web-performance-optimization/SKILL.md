---
name: web-performance-optimization
description: 웹앱 실행 속도를 측정하고 최적화하는 방법론. 이미지·API·렌더링·DB·번들·폰트·코드분할·캐싱·Lighthouse 등 15개 영역을 영향도순으로 적용한다. "속도 개선", "느려요", "버벅임", "성능 튜닝", "번들 줄이기", "이미지 최적화", "select * 제거", "인덱스 추가", "Lighthouse" 작업 시 반드시 사용. web-performance-engineer 에이전트가 이 스킬을 사용한다.
---

# 웹앱 성능 최적화 방법론

속도는 "좋은 서버"가 아니라 **프론트 구조 + API + 이미지 + DB + 렌더 + 캐싱**의 합이다. 추측하지 말고 **측정 → 영향도순 적용 → 검증**한다.

## 느린 원인 체감 비율 (적용 우선순위)

| 원인 | 비율 | 핵심 처방 |
|------|------|-----------|
| 이미지 최적화 실패 | **30%** | WebP·썸네일·lazy·next/image |
| API 느림 | **25%** | 컬럼 좁히기·합치기·캐싱·페이지네이션 |
| React 렌더링 | **20%** | 불필요 재렌더 제거·코드분할 |
| DB 구조 | **15%** | 인덱스 |
| 불필요 JS | **10%** | 미사용 라이브러리 제거·번들 축소 |

**큰 것부터 손댄다.** 이미지/쿼리 한 곳이 memo 열 개보다 크다.

## 0단계: 측정 먼저 (근거 없는 최적화 금지)

- `npm run build` → 라우트별 **First Load JS**(번들 크기) 확인. 큰 라우트가 코드분할 후보.
- grep 패턴으로 안티패턴 위치 파악: `select('*')`, `<img ` (next/image·lazy 없는), `next/dynamic` 부재.
- 인덱스 존재 여부(마이그레이션 `CREATE INDEX`), 폰트 `@font-face`의 `font-display`/preload.
- 배포 후엔 Chrome **Lighthouse**(F12 → Lighthouse): 성능·접근성·SEO 점수와 LCP/CLS/TBT.
- dev 서버 로그의 라우트 응답시간(`GET /x 200 in Nms`)으로 서버 렌더 비용 파악. **단, dev는 prefetch가 꺼져 있어 항상 프로덕션보다 느리다 — 체감 속도는 `next build && next start` 또는 배포본으로 판단**한다.

## 1. 이미지 (영향 최대)

- **포맷 WebP**, **썸네일** 사용, **lazy loading 필수**, **압축 필수**.
- 최소 조치(즉시·저위험): plain 태그에 `loading="lazy" decoding="async"`. 가이드의 기본형 `<img loading="lazy" />`.
- 권장: `next/image` — 자동 WebP·리사이즈·lazy. 단 (a) 외부 호스트는 `next.config` `images.remotePatterns`에 등록, (b) `width/height` 또는 `fill`+사이즈 지정 필요(CLS 방지).
- **예외**: data URL/blob 미리보기는 최적화 불가 → 그대로 둔다.
- 효과: 이미지 최적화만으로 체감 2~5배.

## 2. React 렌더링

- 문제: `setState` 남발 → 불필요 재렌더 → 버벅임.
- 도구: `React.memo`(재렌더 감소), `useMemo`(계산 캐싱), `useCallback`(함수 캐싱), `lazy()`/`next/dynamic`(코드분할).
- **원칙: 프로파일로 확인된 핫스팟에만** 적용한다. 무차별 memo화는 복잡도만 키운다(잘못된 deps는 버그). 큰 목록 아이템·고비용 계산이 1순위.

## 3. 코드 분할 (Code Splitting)

- 문제: 모든 JS를 한 번에 → 첫 화면 느림.
- 해결: 필요한 화면만 로딩. Next.js App Router는 **라우트 단위 분할 자동**.
- 추가 분할은 "**조건부 렌더 + 무거움**"일 때만 가치: 모달, 차트, 카메라/스캐너, confetti 등.
  - `const Heavy = dynamic(() => import('./Heavy'), { ssr: false })`
  - 라이브러리는 동적 `import()`: `const c = (await import('canvas-confetti')).default`

## 4. API 최적화

- 문제: 한 페이지에서 API 20개 호출, 또는 전체 데이터 로드.
- 처방:
  - **컬럼 좁히기 — `select('*')` 금지**. `select('id, name, ...')` 실제 쓰는 것만. (Supabase/SQL 공통)
  - **합치기**: 여러 왕복을 한 쿼리/조인으로.
  - **페이지네이션/limit/무한스크롤**: 목록은 절대 전체 로드 금지.
  - **캐싱**: 변하지 않는 데이터는 재사용.
- **Supabase 주의**: RLS·중첩 select(`drug:drugs(item_name,image_url)`)에서도 내부 컬럼을 명시. 컬럼 좁히기 전 **소비처를 읽어** 필드 누락이 없게 한다.

## 5. DB 최적화 — 인덱스

- 자주 `where`/`join`/`order by` 되는 컬럼(특히 **FK**)에 인덱스. 검색 수십 배 개선 가능.
- `CREATE INDEX IF NOT EXISTS idx_t_col ON t(col);`
- nullable FK는 **partial index**: `... ON t(col) WHERE col IS NOT NULL;`
- 너무 많은 인덱스는 쓰기 비용↑ → 실제 조회 패턴 기반으로만.

## 6. 캐싱

- 의미: 한 번 가져온 데이터 재사용.
- 클라이언트 패칭이 많으면 **React Query**(자동 캐싱·재호출·로딩 최적화) 또는 SWR.
- **RSC(서버 컴포넌트) 우선 앱에선 우선순위 낮음** — 서버에서 받아 내려주면 클라 캐시 라이브러리가 덜 필요. 클라 패칭(자동완성·실시간 검색)이 늘 때 도입.
- Next.js 캐시(`fetch` 캐시, `revalidate`, Cache Components)도 검토. 단 사용자별 동적 데이터는 무캐시가 정답일 수 있다.

## 7. CDN

- Vercel 기본 제공(엣지에서 정적 자산 전달) → 한국 사용자 속도↑. 별도 작업 대개 불필요.

## 8. 불필요한 라이브러리 제거

- `npm install` 남발 → 번들 비대. 미사용은 `npm uninstall`.
- **제거 전 import 0건 확인 + 제거 후 `npm run build` 통과로 확정**(transitive 의존 가정 금지).

## 9. 번들 크기

- `npm run build` 출력으로 라우트별 크기 확인. 큰 의존성은 동적 import·대체 검토.
- 필요 시 `@next/bundle-analyzer`로 시각화.

## 10. SSR / SSG

- Next.js 강점: 서버에서 HTML 생성 → 초기 속도·SEO↑. App Router 서버 컴포넌트가 기본 SSR.
- 정적이어도 되는 페이지는 SSG/ISR로.

## 11. Skeleton UI

- 로딩 중 회색 박스 → **체감 속도** 향상. App Router `loading.tsx`/Suspense fallback 활용.

## 12. 폰트 최적화

- 큰 웹폰트는 LCP를 늦춘다.
- **variable font**, **`<link rel="preload">`**, **subset**(특히 한글은 용량 큼 → 서브셋 권장), `font-display: swap`.
- 로컬 woff2는 head에 preload + `@font-face`에 `font-display: swap`.

## 13. 애니메이션 최소화

- 과한 애니메이션은 모바일 버벅임.
- **GPU 친화 속성(`transform`, `opacity`)만** 애니메이트. `width/top/left` 등 레이아웃 트리거 속성 애니메이션은 피한다.

## 14. 모바일 우선

- 대부분 모바일 접속 → responsive design 필수. 터치 타깃·뷰포트·이미지 사이즈를 모바일 기준으로.

## 15. Lighthouse 검사

- 배포 전/후 F12 → Lighthouse로 성능·접근성·SEO 측정. LCP·CLS·TBT를 기준 지표로 추적.

## 스택별 메모 (이 프로젝트)

- **Next.js 16 App Router + Tailwind v4 + Supabase**. RSC 우선 → 4(컬럼 좁히기)·5(인덱스)가 6(클라 캐시)보다 먼저.
- 마이그레이션은 **Supabase SQL Editor에서 수동 실행**(CLI 없음). 인덱스 변경은 사용자에게 인계.
- dev는 `--webpack`(Windows Turbopack 버그). 체감 속도 판단은 `next build && next start`로.
- 외부 약 이미지(식약처 호스트)를 `next/image`로 쓰려면 `remotePatterns` 등록 필요 — 미등록 시 `loading="lazy"`만.

## 적용 체크리스트

1. `npm run build`로 현 번들·라우트 비용 측정
2. 이미지: lazy/decoding(+가능시 next/image)
3. API: `select('*')` 제거·컬럼 명시, 목록 limit
4. DB: 핫 컬럼 인덱스(IF NOT EXISTS, nullable은 partial)
5. JS: 미사용 의존성 제거(빌드로 확정), 무거운 조건부 컴포넌트 dynamic
6. 폰트: preload + swap (+subset)
7. `npx tsc --noEmit` + `npm run build` 통과로 회귀 차단
8. 배포 후 Lighthouse로 검증
