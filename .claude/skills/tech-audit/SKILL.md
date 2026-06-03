---
name: tech-audit
description: 약사로 케어 앱의 코드 품질·성능·보안·아키텍처를 평가하는 스킬. TypeScript 타입 안전성, Supabase RLS, N+1 쿼리, 인증 취약점, Next.js 패턴 오용을 심층 감사한다. "코드 리뷰", "기술 감사", "보안 점검", "성능 개선", "아키텍처 리뷰", "기술 부채" 요청 시 반드시 이 스킬을 사용하라.
---

# 기술 품질 감사 스킬

## 감사 순서

### 1. 파일 수집
```
src/lib/supabase/          — 클라이언트 3종
src/app/api/ocr/route.ts  — OCR 파이프라인
src/app/api/medications/   — CRUD API
src/app/api/calendar/      — 신규 API
src/lib/dur.ts             — DUR 엔진
src/lib/dur-shadow.ts      — shadow logging
src/lib/supabase/proxy.ts  — middleware
supabase/migrations/       — 마이그레이션 전체
scripts/etl-drugs.mjs      — ETL
```

### 2. 보안 체크리스트 (Critical 판단 기준)

모든 API Route에서 확인:
```ts
// ✅ 올바른 패턴
const { data: { user } } = await supabase.auth.getUser()
if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

// ❌ 위험 패턴 (session은 신뢰 불가)
const session = await supabase.auth.getSession()
```

RLS 확인:
- 모든 테이블에 `ENABLE ROW LEVEL SECURITY` 적용 여부
- INSERT/SELECT/UPDATE/DELETE 각각 정책 존재 여부
- `service_role`만 허용해야 할 테이블(dur_shadow_logs)에 일반 접근 막혀있는지

### 3. 성능 패턴 검사

**N+1 쿼리 탐지:**
wallet/page.tsx에서 약 목록을 로드 후, med-card-item.tsx에서 약마다 `/api/drugs/info` 호출하는지 확인.
→ 배치 조회 필요 여부 판단.

**서버/클라이언트 컴포넌트 분리:**
`'use client'` 없이 `useState`, `useEffect` 사용 여부 탐지.
서버 컴포넌트에서 불필요한 클라이언트 번들 포함 여부.

**Supabase 쿼리 최적화:**
- `.select('*')` 사용 여부 (필요한 컬럼만 선택해야)
- 페이지네이션 없이 전체 조회 (.limit 없음)

### 4. TypeScript 품질

위험 패턴:
```ts
as unknown as Record<string, string>  // 캐스팅 남용
(e: any)                               // any 사용
```

### 5. 아키텍처 적합성

Supabase 클라이언트 사용 규칙:
| 클라이언트 | 올바른 사용처 |
|-----------|------------|
| `client.ts` | 클라이언트 컴포넌트 |
| `server.ts` | 서버 컴포넌트, API Route, Server Action |
| `admin.ts` | service_role 필요 작업만 |

잘못된 사용(admin을 클라이언트에서 사용 등)을 탐지한다.

### 6. 출력
`_workspace/eval/02_tech-audit.md`에 저장.
Critical → High → Medium → Low → 잘 된 점 → 기술 부채 목록 순서.
각 이슈에 파일:라인 위치와 수정 코드 스니펫 포함.
