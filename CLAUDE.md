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

보호 경로: `/dashboard`, `/medications`, `/profile`, `/wallet`, `/interactions`, `/store`

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
- `/interactions` 페이지는 `NEXT_PUBLIC_SHOW_INTERACTIONS=false`로 네비게이션에서 숨겨진 상태

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

## 변경 이력

| 날짜 | 변경 내용 | 대상 | 사유 |
|------|----------|------|------|
| 2026-05-31 | 초기 하네스 구성 | 전체 | 약사로 케어 MVP 설계 착수 |
| 2026-06-01 | V1 개발 하네스 추가 | agents/skills 3+4개 | DUR shadow + 약 지갑 + QR 매핑 구현 착수 |
| 2026-06-01 | 로그인 Server Action 전환 | login/signup | 모바일 GET 제출 버그 수정 |
| 2026-06-01 | OCR 파이프라인 간소화 | /api/ocr | 이미지 파기 + user_prescriptions 저장 |
| 2026-06-01 | backend-engineer 보강 (§6 실무 요구사항) | agents/backend-engineer.md | OCR 413/압축·QR 세션유실 방지·DUR shadow 연동 + OCR 모델 드리프트 정정(CLOVA 유지), raw_medicine_list JSONB 전환 방향 명시 |
| 2026-06-01 | frontend-engineer 보강 (§6 실무 요구사항) | agents/frontend-engineer.md | 하이드레이션 스켈레톤·의사제시용 초고대비 모달·터치영역/햅틱·QR 쿠키 규약(pending_pharmacy_id) 반영 |
| 2026-06-01 | tech-architect 보강 (§6 실무 요구사항) | agents/tech-architect.md | medication_schedules 신규 테이블·DUR shadow 격리·이미지 임시버퍼 파기 + 드리프트 정정(CLOVA 우선, drugs/user_prescriptions, 쿠키명) |
| 2026-06-01 | §6 백로그 구현 (A+M1) | wallet·meal-checks·ocr·login | 의사제시 모달·복약체크 서버영속화(medication_schedules/006)·하이드레이션 스켈레톤·햅틱·OCR 413+Canvas압축·로그인 redirect 존중(QR 세션유실 수정). M2(raw_medicine_list JSONB)는 보류 |
| 2026-06-01 | medication_check_logs 추가 (007) | api/meal-checks·migrations/007 | 복약 체크 이력 로그(append-only) 추가. schedules=현재상태, check_logs=순응도 이력 |
| 2026-06-01 | 약 사진 표시 (실버 UX) + drugs.image_url 캐시(008) | wallet/med-card-item·ocr-uploader·api/drugs/info | 허가정보 약 이미지를 약지갑/OCR결과 카드에 노출. /api/drugs/info가 item_seq 기준 image_url lazy-cache |
| 2026-06-01 | 약 이름 옆 (성분명) 표시 + 복약 수정/삭제 | wallet/med-card-item·api/medications/[id] | 약지갑·OCR결과에 (성분명) 표기. 카드별 수정(용법/이름)·삭제(소프트) 버튼 + PATCH/DELETE API |
| 2026-06-01 | 처방전별 모두 삭제 | wallet/medication-groups·api/medications/bulk-delete | 그룹(처방전)당 약 2개+ 일 때 "모두 삭제" 버튼(인라인 확인) + bulk-delete API |
| 2026-06-01 | EDI 코드 약물 식별 | api/ocr·api/drugs/info·ocr-uploader | 처방전 [9자리 보험코드] 캡처 → 허가정보 edi_code 파라미터로 정확 1건 조회(이름검색보다 정확). OCR→정보조회 경로 적용(무마이그레이션) |
| 2026-06-01 | 코드 전용 인식 | api/ocr (resolveByCodes) | 코드만 촬영 시(약품명 라인 없음) 일반 파싱 0건이면 9자리 코드 전체를 허가정보로 역조회해 약품명 자동 식별. 미해석 코드는 자동 제외 |
| 2026-06-01 | 복약 만료일 표기 | wallet/page·medication-groups | 처방전 헤더에 만료일(처방일+총투약일수) + D-day 배지. 만료 지난 처방은 회색 처리 |
| 2026-06-01 | OCR 하이브리드 파싱 | api/ocr | 키 있으면 GPT(용법·구조)+EDI코드 신원교정, 없으면 코드기반→정규식. 코드 용법은 순수숫자+범위검증으로 오인 차단 |
| 2026-06-03 | 앱 평가 하네스 추가 | agents 3개·skills 4개 | ux-auditor·tech-auditor·product-auditor + app-evaluation-orchestrator 신규 구성 |
| 2026-06-03 | UI/UX 디자인 구현 하네스 추가 | agents 3개·skills 4개 | design_handoff_yaksaro_care 핸드오프 → 코드 재구현. design-system-engineer·screen-implementer·design-qa-reviewer + ui-ux-implementation-orchestrator. 결정: green600 #0E6E54·Paperlogy ExtraBold·confetti=canvas-confetti·색은 토큰만 |
| 2026-06-03 | 그린 디자인 시스템 + 9개 화면 전체 재구현 | globals.css·components/yc·9개 화면 | 블루→그린 토큰 마이그레이션·Paperlogy ExtraBold·키프레임·YC 컴포넌트 7종. Home·Today(confetti)·Wallet·Calendar·Settings·Share·Landing·AddMed·OCR 전부 토큰화(데이터/API 보존). tsc 통과·규제 0·하드코딩 hex 0 |
| 2026-06-03 | PWA 풀세트 | manifest·sw·splash·install·push·cron | 설치가능(manifest+아이콘)·오프라인 SW·런치 스플래시 애니메이션·설치배너(Chrome/iOS/카카오)·웹푸시(VAPID, 013 push_subscriptions)·예약 복약 리마인더(cron+vercel.json). 사용 전 013 마이그레이션 실행 + Vercel VAPID/CRON_SECRET env 필요 |
| 2026-06-03 | DUR 성분기반 ETL | scripts/etl-dur-ingredient.mjs | 기존 item_seq 제품매칭(수율~0) → 성분(INGR_CODE)쌍 매칭으로 재작성. 풀 페이징이 우리 약 성분코드 역적재+교차곱. 실행 중 |
| 2026-06-04 | 약사 모드 개발 하네스 추가 | agents 1개·skills 3개 | pharmacy-security-engineer 신규 + pharmacy-rls-security·pharmacy-dashboard-build·pharmacist-mode-orchestrator. tech-architect·regulatory-analyst·design-system·design-qa 재사용, backend/frontend-engineer 도메인무관 보강. 규제·RLS 보안 선행게이트. (Layer1 하네스만 — 실제 약사 코드는 오케스트레이터 실행 시) |
| 2026-06-04 | 약사 모드 MVP 구현 | migrations/014·api/profile·proxy·app/pharmacy/* | 약사 read-only 대시보드. consent_pharmacist_view opt-in + pharmacist_can_view() SECURITY DEFINER 게이트(관계 AND 동의) + 약사 SELECT RLS. /pharmacy 단골환자 목록·복약 read-only·검색. role 가드. 사용자토큰+RLS(admin 우회 0)·쓰기경로 0·지시문구 0. tsc·빌드 통과. ⚠️ 배포 전 014 실행+약국계정 발급+RLS 누수테스트 필요 |
