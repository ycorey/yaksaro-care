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
| 2026-06-04 | 웹앱 성능 하네스 + 성능 기준 | agents 1개·skills 2개·CLAUDE.md·memory | web-performance-engineer + web-performance-optimization·web-performance-orchestrator(생성-검증, design-qa-reviewer 재사용). 성능 가이드(15영역) → 영속 표준(CLAUDE.md "성능 기준" + feedback 메모리). 트리거: 성능 측정+코드수정 전용(app-evaluation/tech-audit 리포트와 구분) |
| 2026-06-04 | 성능 즉시 적용 (C1~C6) | 8 layout·profile·약썸네일5·015·layout폰트·package·confetti | select('*')→컬럼명시, 약 썸네일 lazy/decoding, 015 인덱스 마이그레이션, Paperlogy preload, 미사용 의존성 제거, confetti 동적 import. 영향도순 적용·빌드 검증 |
| 2026-06-04 | 약 마스터 9배 확장 + DUR 7000배 | scripts/etl-drugs-license·etl-dur-from-csv·016·api/drugs/search | drugs 4,795→43,224(식약처 허가정보: 성분명·전문/일반·EDI보험코드·is_canceled). EDI 보험코드가 심평원 병용금기 CSV 매칭 브릿지 → interactions 42→305,005. 검색은 정상품목만(is_canceled=false). ingredient_code·image_url 보존. tsc·빌드 통과 |
| 2026-06-10 | 미커밋 작업 정리 커밋 (6/8~9분) | 마이그레이션 018~022·meal-slots·Phosphor 전환 | 슬롯 개인화(meal_times 실측)·체크 서버 단일화·OCR EDI 매칭 수정·trigram 검색·건기식 동기화 cron을 3개 커밋으로 분리. 018~022 운영 DB 적용 확인 완료 |
| 2026-06-10 | 접근성 대비 상향 (평가 H6) | ocr-uploader·otc-section | neutral400/300 본문·정보성 텍스트 11곳 → neutral500 (WCAG AA 4.5:1). 장식 아이콘·워드마크는 유지 |
| 2026-06-10 | 001 베이스 스키마 역덤프 (평가 H7) + 중복 인덱스 정리 | migrations/001·023 | 운영 DB 역덤프로 베이스 스키마(8테이블·RLS·handle_new_user·pharmacy_patients/prescriptions 레거시 포함) 버전관리 편입 — 운영 DB 재실행 무해성 검증 완료. 015/022가 베이스와 중복 생성한 인덱스 2개 DROP(023, 운영 적용) |
| 2026-06-10 | 핵심 본문 px→rem 전환 (평가 5위) | home-client·calendar·today-timeline·landing·yc-button | 22px/17px/34px/15px 본문·버튼 텍스트 → rem. 글자크기 설정(html font-size 16/18/20)이 핵심 읽기 경로에 실제 반영. 장식 칩·배지(10~11px)는 px 유지 |
| 2026-06-10 | 설정 서버 영속(024) + cron 토글 반영 + admin→user 토큰 | migrations/024·api/profile/settings·settings·cron·ocr·store·auth/callback | profiles에 font_size/alarm_enabled/alarm_times(키=meal-slots와 동일, night→bedtime). 리마인더 cron이 토글 꺼진 사용자 제외 + bedtime cron(22시 KST) 추가. 본인 행 쓰기는 전부 user 토큰+RLS로 전환(admin은 약국 조회만) |
| 2026-06-10 | DB 타입 전면 적용 + lint 0 | types/database.ts·클라이언트 3종·30파일 | supabase gen types 주입, 조인 캐스팅 18곳 제거. React19 lint 에러 16→0(렌더중 상태조정·파생 loading·비동기 초기화·모듈 스코프 컴포넌트), 워닝 10→0 |
| 2026-06-10 | B2B 약국 QR 온보딩 | api/pharmacy/store-id·pharmacy/qr·대시보드 카드 | store_id 셀프 발급(owner RLS) + QR SVG 생성(qrcode)·A4 인쇄 안내문(print: variant). 환자 스캔→/store→단골 매핑 연결 — B2B 영업 가능 상태 진입 |
| 2026-06-10 | UX Low 일괄 | home·wallet 헤더·ocr-uploader·bulk | 설정 기어 aria-label, OCR 복용시간 칩 터치 타겟 py-2.5·text-sm, 로딩 스피너, bulk 이름 매칭 정확 일치 우선 |
| 2026-06-10 | 4차 평가 종합 91점 — 3개 영역 전부 독립 에이전트 검증 (1차67→2차76→3차82→4차91) | _workspace/eval·meal-slots·cron·bulk | UX 90·기술 90·제품 92, Critical·High 0. 발견 즉시수정: 무시간대 약 defaultMealKeys 폴백(홈/today 동일 규칙), sync-supplements cron secret 미설정 시 401, EDI 콤마 경계 매칭. 다음 상승 여력: 탭바 비활성 대비(+3~4)·끼니 라벨/시각 상수 단일화(+2~3)·Sentry(+2) → 93~94권 |
| 2026-06-15 | 끼니 상수 SSOT 단일화 + 경량 로거 도입 (점수 상승 잔여) | meal-slots·meal-icons(신규)·logger(신규)·home/today/ocr/settings/wallet 등 12파일 | 끼니 라벨·시각은 meal-slots.ts(MEAL_LABELS/MEAL_TIMES/isMeal), 아이콘은 meal-icons.tsx(서버 번들 분리)로 통합 — 10개 파일 중복 제거(알림 라벨 '취침'→'자기 전' 통일). console.* 11곳을 logger.ts(외부 의존성 0, Sentry 확장지점 주석)로 통일. 탭바 대비·OCR칩 48px은 6/10에 이미 반영돼 재확인만. tsc·lint 클린(next build 미실행). Sentry 풀 도입은 추후 |
| 2026-07-01 | 95점 마감 3영역(UX 8건 + 기술 L1·L3 + 제품 PDF 리포트) | UX 8파일·prescription-section·wallet/default·calendar/route·share/*(report-view 신규)·globals.css | **UX**: 터치타겟·일관성 8건(pharmacy-request 뒤로가기 48px·box-ocr 보조버튼 min-h44·전문가 토글 min-h36+"성분명까지 표시 중"·otc 배지 text-xs·요일버튼 h-12·검색입력 py-3·today 일괄복용 되돌리기 토스트·home 요청/전화 배지 h-10). **기술 L1**: MedCard에 scheduleType 원본 전파→전부-PRN 처방 그룹은 끼니버튼 생략(오늘복약·알림 제외와 정합). **기술 L3**: 캘린더 route에 활성멤버 스코프(self=legacy member_id null 포함, 가족=엄격)—가족 체크로그 합산 버그 해결. **제품**: /share에 복약 PDF 리포트(window.print, 의존성 0)—최근 30일 순응도(기록한날·총체크·평균+30칸 히트맵, 임의 분모 없이 기록기준 서술)+복약목록, @media print 격리(#yc-print-area). tsc·lint·next build 통과 |
| 2026-07-02 | ultraqa 회귀 2건 수정 + E2E 하네스 + 5차 재평가 92 + 95 경로 8건 | globals.css·e2e/(신규 5스크립트)·041·member-switcher·share-client·home-client·otc-section·ocr/route·bulk/route·report-view | **ultraqa**: 인쇄 inset:0 다중페이지 잘림 + 전역 print 규칙이 QR 포스터 인쇄 백지化 → body:has(#yc-print-area) 스코프로 수정. **E2E**: OAuth-only라 service_role 임시유저+@supabase/ssr 세션쿠키 주입 스모크(e2e/setup·run·teardown·clean-orphans, 의존성 0, 운영DB 사용 후 전량삭제) 11/11. **5차 재평가(실측)**: UX 94·기술 92·제품 91 → 종합 92(4차 91). Critical·High 0. **95 경로 8건**: 041(handle_new_user·end_expired_medications SET search_path=public — 운영 적용 필요), UX4(멤버스위처 h-10/h-11·전달목록 text-sm·홈 멤버라벨 text-base·OTC × 44px터치), 제품3(OCR 0건 시 처방행 INSERT 생략=orphan 방지·이름 부분일치 유일후보만 채택=오매칭 방지·리포트 "기록한 날(30일 중)"+미기록≠미복약 문구). tsc·lint·build·E2E 11/11 |
| 2026-07-02 | 6차 평가 잔여 4건 (P-M1·UX M3·UX M4·P-M2) | @calendar 2파일·@home/@today/@share 각 2파일·@wallet/default·member-switcher·api/members·types/database·042(신규) | **P-M1**: CalendarClient에 activeId prop 전파(useEffect dep+loadedKey) — 멤버 전환 시 히트맵·요약 즉시 갱신. **UX M3**: 비활성 "지금 먹기" 버튼 neutral200/600→neutral300/700 대비 상향. **UX M4**: 멤버 스위처를 5개 탭 전부 AppHeader 아래로 통일(클라 컴포넌트에 memberSwitcher ReactNode prop, 캘린더는 직접 렌더). **P-M2**: members.consent_at(042) + api/members POST가 동의 필수 검증·서버 시각 기록(감사 근거), member-switcher가 consent 전달. tsc·lint·build 통과. ⚠️ 041·042 운영 DB 적용 필요(분류기가 자동 적용 차단 — 수동 승인) |
| 2026-07-02 | UX M1·M2(스와이프 어포던스·제스처 충돌) + 기술 Low 3건 | tab-pager·globals.css·lib/member·api/calendar·@share/default·api/drugs/info·pharmacy/(app)/page | **M1**: 페이지 도트 5개(탭바 위 fixed, 활성=green600 pill, 장식·조작은 탭바) + 최초 1회 스와이프 힌트(트랙 -10px 나갔다 복귀, pointer:coarse+localStorage 게이트, index 0 한정—키프레임 translateX(0) 기준). **M2**: 좌측 엣지 24px 데드존(iOS 뒤로가기 양보) + `data-pager-ignore` 조상 가드(향후 가로 스크롤 UI 대비). **기술 L1**: applyMemberScope() SSOT(lib/member.ts)로 캘린더 route·전달 리포트 `.or` 중복 제거. **L2**: drugs/info 이미지 캐시 fire-and-forget에 reject 핸들러. **L3**: 약사 환자목록 `.limit(200)`. L4(프록시 role)는 실측상 /pharmacy·login 경로에만 스코프돼 있어 JWT claim 이관은 중기 유지. tsc·lint·build 통과 |
| 2026-07-02 | UX Low 폴리싱 4건 (6차 L1·L2·L3·L5) | today-timeline·calendar-client·otc-section | L1: today 펼침 약 아이콘 blue500/60→neutral400(그린 팔레트 통일, 파랑 잔재 0). L2: 캘린더 월 이동 ‹›→CaretLeft/Right(bold 18) Phosphor 통일. L3: OTC 삭제 × 문자→X 아이콘(16, 히트 중심 정렬). L5: today 면책·캘린더 스페이서 pb-36→pb-4(페이저 패널 pb-28과 이중여백 제거). L4(홈 헤드라인)는 실측상 이미 rem(text-[1.375/1.625rem])이라 수정 불필요 판정. tsc·lint·build 통과 |
| 2026-07-02 | 7차 재평가 종합 96 (UX 96·기술 97·제품 95, 6차 94 대비 +2) | _workspace/eval(7차)·eval_prev(6차) | 6차 지적 15건 전해소 실측(UX M1~M4·L1/L2/L3/L5, 기술 L1~L3, 제품 P-M1·P-M2) + 오지적 2건 정정(UX L4=이미 rem·기술 L4=role 조회 경로 스코프됨). Critical·High 0 4회 연속, 신규 기능결함 0. 041·042 운영 적용 당일 완료(list_migrations 확인). 잔여: UX M2 멤버 컨텍스트 바·M1 도트 클릭(+2점권), UX Low 5·제품 Low 3, 운영 게이팅(약사 RLS 누수 실측·Vercel env). 97~98 경로 리포트에 명시 |
| 2026-07-02 | 7차 M1·M2 + UX Low 3건 (97~98 경로) | member-context-bar(신규)·5탭 배치·tab-pager·today-timeline·otc-section·app-header | **M2**: MemberContextBar 공용 컴포넌트 — 비본인 멤버 활성 시 sticky 컨텍스트 바("○○님의 복약을 보고 있어요", 본인=렌더 0)를 5개 탭 전부 배치(wallet 직접·home/today/share memberSwitcher prop 프래그먼트·calendar 직접). **M1**: 페이지 도트를 버튼화(p-2 히트, aria-label/current, 클릭 시 setDisplayIndex+push) — 무반응 오인 제거. **L2**: today 시간 text-sm·끼니 라벨 text-base(w-14). **L3**: OTC 칩 약명 text-base·max-w-170px. **L4**: 워드마크 decoding=async. L1(요일 blue700)은 관습적 예외로 방침 보류, L5(비활성 전폭)는 선택 항목이라 보류. tsc·lint·build 통과 |
