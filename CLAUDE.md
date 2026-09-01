# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 약사로 케어 (Yaksaro Care)

처방약 + OTC + 건강기능식품 통합 복약관리. 전면 메시지는 **디지털 약 지갑 + 단골약국 CRM**이며, DUR 상호작용 엔진은 백엔드 shadow 로직으로만 유지한다.

- **타겟**: B2C(환자 무료) + B2B(약국 유료 SaaS)
- **스택**: Next.js 16.2.6 (App Router) + Supabase + NAVER CLOVA OCR + GPT-4o-mini + Vercel

---

## Commands

```bash
npm run dev          # 개발 서버 (0.0.0.0:3000, 모바일 접속 가능)
npm run build        # 프로덕션 빌드
npm run lint         # ESLint

npm run etl:drugs        # 식약처 의약품 → drugs 테이블
npm run etl:supplements  # 건강기능식품 → supplements 테이블
npm run etl:dur          # DUR 병용금기 → interactions 테이블 (약 34분, API 일일 한도 있음)
npm run etl              # 전체 실행
```

DB 마이그레이션은 CLI/psql 없이 Supabase SQL Editor에서 직접 실행한다 (`supabase/migrations/`).

---

## Architecture

### Auth 흐름

`src/proxy.ts`가 Next.js middleware 역할을 한다 (`middleware.ts`가 아님 — Next.js 16.2.6 컨벤션). 모든 요청에서 `src/lib/supabase/proxy.ts`의 `updateSession()`을 호출하여 세션 쿠키를 갱신한다.

보호 경로: `/dashboard`, `/medications`, `/profile`, `/wallet`, `/today`, `/calendar`, `/home`, `/share`

**로그인/회원가입은 Server Action 방식만 사용한다.** `react-hook-form` 클라이언트 방식은 모바일에서 하이드레이션 전 GET 제출 버그가 있어 제거됨.

### Supabase 클라이언트 3종

| 파일 | 용도 |
|------|------|
| `src/lib/supabase/client.ts` | 클라이언트 컴포넌트 (`createBrowserClient`) |
| `src/lib/supabase/server.ts` | 서버 컴포넌트 / Server Action / Route Handler |
| `src/lib/supabase/admin.ts` | service_role key 필요 작업 (이미지 삭제, shadow log 등) |

### OCR 파이프라인

`POST /api/ocr` → NAVER CLOVA OCR(텍스트 추출) → GPT-4o-mini(파싱) → `user_prescriptions` 저장 → Storage 이미지 **즉시 파기** → DUR shadow 체크(fire-and-forget).

파싱 결과: `{ medicines: string[], duration_days: number|null, pharmacy_name: string|null }`

### DUR 엔진

- `src/lib/dur.ts` — `checkInteractions(supabase, drugIds[])`: interactions 테이블 직접 쿼리 (ETL로 미리 적재된 데이터)
- `src/lib/dur-shadow.ts` — `logDurShadow()`: OCR 완료 후 fire-and-forget으로 호출. **절대 `await` 없이 호출할 것** — 사용자 응답을 차단하면 안 됨
- ⛔ **환자 대면 상호작용 화면은 만들지 않는다.** `/interactions` 페이지와 `/api/interactions/check` 는 **2026-08-31 에 삭제됐다** — 링크만 없었을 뿐 로그인 사용자가 URL 로 열 수 있었고, `병용금기`·`안전` 배지와 "검출되지 않았습니다"(음성 판정)를 면책 없이 표시해 Play 건강앱 정책·식약처 웰니스(비의료기기) 판정에 동시에 걸렸다. `NEXT_PUBLIC_SHOW_INTERACTIONS` 플래그 방식은 폐기했다 — **읽는 코드가 `src/` 에 0건이라 가드가 아니었다.** 노출 가능한 DUR 은 약 지갑의 "정보 있음 + 약사 상담" 형태뿐이다(`src/lib/dur-flags.ts`). 회귀 가드: `e2e/store-readiness-qa.mjs`

### DB 핵심 테이블

| 테이블 | 설명 |
|--------|------|
| `drugs` | 식약처 의약품 마스터 (item_seq PK) |
| `supplements` | 건강기능식품 마스터 |
| `interactions` | DUR 병용금기 쌍 (drug_a_id, drug_b_id — 항상 a < b 정렬) |
| `user_medications` | 사용자 복약 프로필 (drug_id or supplement_id or custom_name) |
| `user_prescriptions` | OCR 처방전 원본 텍스트 (이미지 파기 후 텍스트만 보존) |
| `dur_shadow_logs` | DUR shadow 체크 로그 (service_role만 INSERT) |
| `pharmacies` | 약국 계정 (store_id: QR 매핑용 식별자) |
| `profiles` | auth.users 확장 (regular_pharmacy_id: 단골약국 FK) |

### QR 약국 매핑 흐름

`/store/[store_id]` → `pending_pharmacy_id` 쿠키 저장(7일) → 로그인 시 `auth/callback`에서 `profiles.regular_pharmacy_id` 업데이트 → 쿠키 삭제 → `/wallet?pharmacy_linked=1`

### UI 컨벤션

- 카드: `bg-white rounded-2xl border border-gray-200`
- 약 지갑(`/wallet`)은 실버 세대 대상 — 약품명 `text-xl font-bold` 이상, 터치 타겟 최소 52px
- 토스트: `sonner` (`toast.success / toast.error`)
- 레이아웃 패턴: 각 섹션별 `layout.tsx`에 `DashboardNav` + `<main className="pb-24 md:pb-0 md:ml-64">`

---

## 하네스: 약사로 케어 분석 시스템

**트리거:** "약사로 케어 분석", "시장 조사", "보고서 생성", "기술 설계", "규제 분석", "경쟁사 비교", "MVP 정의", "투자 평가", "다시 실행", "업데이트" 등 → `yaksaro-care-orchestrator` 스킬 사용.

**보고서 출력:** `_workspace/final/yaksaro-care-comprehensive-report.md`

## 하네스: 앱 평가 시스템

**트리거:** "앱 평가", "보완해야 할 것", "전체 점검", "품질 감사", "개선점 분석", "다시 평가" 요청 시 `app-evaluation-orchestrator` 스킬을 사용하라.

## 하네스: V1 Core 개발 시스템

**트리거:** "V1 구현", "약 지갑 만들어줘", "DUR 모듈화", "QR 매핑", "OCR 간소화", "shadow testing", "wallet UI", "코어 기능 개발", "다시 구현", "V1 업데이트" 등 → `v1-dev-orchestrator` 스킬 사용.

## 하네스: UI/UX 디자인 구현 시스템

**목표:** `design_handoff_yaksaro_care` 핸드오프(hi-fi 프로토타입)를 실제 코드베이스에 그린 디자인으로 재구현한다.

**트리거:** "디자인 핸드오프 구현", "디자인 적용", "프로토타입 반영", "그린 토큰 적용", "화면 재구현", "디자인 시스템 구축", "UI 개선 구현" 요청 시 `ui-ux-implementation-orchestrator` 스킬 사용. (기존 앱 *평가*는 `app-evaluation-orchestrator`/ux-audit — 이쪽은 *구현*.) 모든 개발 에이전트는 `design_handoff_yaksaro_care/README.md`를 단일 진실 공급원으로 읽는다.

## 하네스: 약사 모드(약국 read-only 대시보드) 개발

**목표:** 약사(약국)가 동의한 단골 환자의 복약을 읽기 전용으로 보는 B2B 대시보드를 규제·동의·RLS 보안 게이트 기반으로 개발한다.

**트리거:** "약사 모드", "약국 대시보드", "약사 화면 개발", "단골 환자 조회", "약사 RLS", "약국 B2B" 요청 시 `pharmacist-mode-orchestrator` 스킬 사용. (환자용 코어=`v1-dev-orchestrator`, 디자인 구현=`ui-ux-implementation-orchestrator`와 구분 — 이쪽은 약사/약국이 *타인(환자)* 데이터를 보는 영역 전용.) 핵심 계율: 관계(QR 단골) ≠ 동의 → 명시적 opt-in 동의가 RLS의 AND 조건. 약사 조회는 사용자 토큰+RLS(service_role 우회 금지), read-only 최소권한.

---

## 웹앱 성능 기준 (개발 시 기본 적용)

코드 작성/리뷰 시 항상 적용한다 (영향도순: 이미지30·API25·렌더20·DB15·JS10):
- **Supabase `select('*')` 금지** → 소비 컬럼만 명시. 목록은 limit/페이지네이션.
- **이미지**: 최소 `loading="lazy" decoding="async"` (+가능하면 `next/image`).
- **인덱스**: 자주 where/join 되는 FK에 `CREATE INDEX IF NOT EXISTS` (nullable은 partial).
- **번들**: 미사용 패키지 제거(빌드로 확정), 무겁고 조건부인 클라 컴포넌트는 `next/dynamic`.
- **폰트**: head preload + `font-display: swap` (+한글 subset). **애니메이션**: `transform`/`opacity`만.
- 체감 속도는 dev가 아니라 `next build && next start`로 판단(dev는 prefetch 꺼짐).

상세·트리거형 자동 최적화는 `web-performance-optimization` 스킬 / `web-performance-orchestrator` 하네스.

## 하네스: 웹앱 성능 최적화

**목표:** 웹앱 실행 속도를 측정→영향도순 적용→회귀 검증한다(리포트가 아니라 코드를 직접 고침).

**트리거:** "속도 개선", "느려요", "버벅임", "성능 튜닝", "번들 줄여줘", "이미지 최적화 적용", "인덱스 추가", "Lighthouse 개선" 요청 시 `web-performance-orchestrator` 스킬 사용. (품질 *리포트*는 `app-evaluation`/`tech-audit` — 이쪽은 측정+수정.) 작업자 web-performance-engineer + 검증자 design-qa-reviewer.

---

## 하네스: 상호작용 매칭 게이트 평가

**목표:** 건기식·약물 상호작용 파이프라인의 **관련성 매칭 게이트**(MedData가 페어매칭을 안 해서 필요한 핵심 차별점)를 갈아끼울 때(rule→rxclass→claude→hybrid) "정말 나아졌는지"를 precision/recall로 증명한다. (작업 루트: `interaction-poc/eval-harness/`. 무파괴: `interaction-poc/04_pipeline_poc/`는 import만.)

**트리거:** "매칭 게이트 평가", "매처 평가/채점", "precision recall 측정", "매처 baseline", "rxclass 붙이고 재측정", "claude 매처 비교", "hybrid 매처", "매처 회귀", "정답셋 확장/라벨링", "다시 측정", "baseline 갱신" 요청 시 `matcher-eval-orchestrator` 스킬 사용. (상호작용 *파이프라인 자체*는 `interaction-poc/04_pipeline_poc` — 이쪽은 그 매칭 게이트를 *평가/승급*하는 전용 하네스.) 팀: matcher-engineer·golden-curator·eval-scorer·eval-qa.

**변경 이력:**
| 날짜 | 변경 내용 | 대상 | 사유 |
|------|----------|------|------|
| 2026-06-21 | 초기 구성 + 평가 코드 STEP1~5 | eval-harness/ 전체·agents 4·skills 4 | 매칭 게이트 precision/recall 채점·회귀 비교 프레임. rule baseline=1.000(시드, DRUG_HINTS 손맞춤 한계 명시), rxclass/claude/hybrid 스켈레톤 |

---

## 변경 이력

전체 이력은 **[docs/HARNESS-CHANGELOG.md](docs/HARNESS-CHANGELOG.md)** 에 있다 (74건).
이 파일은 매 턴 컨텍스트에 실리므로 이력 본문은 여기에 쓰지 않는다 — 새 항목은 위 파일 맨 아래에 추가하고,
아래 "최근" 목록만 5건으로 유지한다.

**최근:**
- **2026-08-27** — 3종 실사용 시뮬레이션(프로덕션+Playwright 390×844) → 숨은 결함 3건 수정
- **2026-08-28** — 자문 3렌즈 + ultraqa 반영 21건 — DUR 등재 원문의 **투여 지시 제거**(sanitizeElderlyNote)·신호 도달률·완주 피드백
- **2026-08-28** — ultraqa 검증 재개(저비용 모델) — 수정본 역공격에서 4건 추가(직접입력 약 사진 오귀속·이미지 되쓰기·QA 플레이크)
- **2026-08-28** — 3렌즈 독립 스윕 — 검증 문구 대비 1.76:1 수정·OCR 화면 `r.ok` 일관화·**저장 완주 e2e 신설**(저장소에 0개였다)
- **2026-08-31** — Play 출시 선결 — `/interactions` 삭제·심사자 입구·§23 동의 기록(6/7이 미기록이었다)·고지 3종

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
