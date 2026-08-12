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
| 2026-08-07 | 보안 감사 3종 병렬 + Critical 2건 차단(046 운영 적용) | migrations/046(신규)·운영 DB 권한 | security-reviewer 3개(인증·RLS / API 라우트 / 시크릿·설정) 병렬 감사 후 운영 DB 카탈로그로 실증. **C1**: `end_expired_medications`(SECURITY DEFINER·user_id 스코프 없음·영향범위를 호출자 `today`가 결정)가 `anon=X` → 공개 anon 키로 **미인증 1회 호출 시 전 사용자 복약 파괴**(복구 불가). 019/041의 REVOKE 누락(014/031은 정상). **C2**: `pharmacies_owner`가 `FOR ALL`이라 INSERT 개방 → 누구나 약국 자가 발급 → `pharmacist_can_view()`가 role이 아닌 `owner_id`만 보므로 QR 배포+환자 동의만으로 건강정보 열람. **H2**: 테이블레벨 UPDATE로 `profiles.role` 자기 승격 가능(트리거 pin 없음, `handle_new_user`가 가입 메타 role 신뢰) → 미들웨어·레이아웃 두 가드가 같은 조작가능 값을 읽어 이중방어 미성립. **046**: 정의자함수 3종 EXECUTE 회수(service_role 유지, 트리거 실행은 EXECUTE 미검사), `pharmacies_owner` DROP(017의 select/update가 승계), Postgres 특성상 컬럼 REVOKE가 무효라 **테이블 REVOKE→허용컬럼 재GRANT**(profiles: role 제외 14컬럼 / pharmacies: name·phone·address·store_id). 검증: advisor 경고 3건 소멸·E2E 11/11(약사 RLS 누수 21/21). **미조치**: `pharmacist_can_view`·`is_self_member`는 참조 정책 8개가 전부 `TO public`이라 anon 회수 시 익명 조회가 "0건"→"permission denied"로 실패 → 정책을 `TO authenticated`로 좁힌 뒤 별도 처리. 잔여 High: OCR 원문(주민번호·실명) OpenAI 전송+국외이전 미고지, `drugs` 마스터 admin 우회 upsert 3곳, rate limit 전무, next@16.2.6 CVE |
| 2026-08-07 | 보안 감사 잔여 High 4건 + Medium 4건 해소 (047) | redact-pii·rate-limit·bearer-auth·drug-master(신규 4)·migrations/047·privacy·next.config·landing vercel.json·OCR/evidence/cron/medications 라우트 | **H1(PII)**: `redactPii()`로 주민번호(하이픈·무구분자·부분마스킹)·환자실명·생년월일·전화번호를 **전송 전** 제거 후 GPT 호출, 잔존 시 외부 전송 포기하고 정규식 폴백. 프롬프트 지시는 출력만 통제하므로 결정론적 차단으로 대체. 단위테스트 6종(EDI 9자리·요양기관기호 8자리·바코드 보존 회귀 포함). 앱 처리방침에 **국외이전 조항 신설(제7조)** + 수탁사 실명화(CLOVA·OpenAI·Anthropic·Vercel 추가), 제7~12조→제8~13조 재번호. **H2(마스터 오염)**: `resolveDrugIdByItemSeq()` SSOT — 사용자 입력은 조회 키로만 쓰고 약품명·제조사·이미지는 허가정보에서 재취득, item_seq 9자리 검증 + 이미지 호스트 화이트리스트(nedrug.mfds.go.kr). 호출부 3곳(add/actions·[id]·bulk) + 클라 2곳(med-card-item·add-form)에서 drug_entp/drug_img 전송 제거. **H3(rate limit)**: 047 `api_quota` + `consume_quota()` — service_role 전용(046 교훈: 클라 호출가능 DEFINER 금지), 한도는 DB가 아닌 앱에서 비교해 인자 조작 우회 차단, 지난 윈도우 자동 정리. OCR 30/일·박스 40/일·evidence 20/일·공공API 300/시. 계측 장애 시 fail-open(비용 보호용이라 기능은 안 막음). **H4**: next 16.2.6→16.3.0 — 프로덕션 의존성 취약점 3건(미들웨어 우회·postcss·sharp)→**0건**. **Medium**: `isAuthorizedBearer()`로 cron 3종+evidence 시크릿 비교를 timingSafeEqual+Bearer 접두사 필수로 통일(기존 `.replace()`는 접두사 없이도 통과), 랜딩 vercel.json 보안헤더 5종 신설(전무했음)·앱 HSTS 추가(preload는 해제 난이도 때문에 제외), `pending_pharmacy_id` httpOnly+secure. 16.3.0 신규 lint 규칙이 잡은 `window.location.href` 3곳은 쿠키 경쟁·sessionStorage 핸드오프 때문에 **의도된 하드 내비게이션**이라 사유 주석과 함께 예외 처리. 검증: tsc·lint(워닝 0)·build·unit 55/55·E2E 11/11·쿼터 카운터 실측(1→2→3). ⚠️ 랜딩 헤더는 landing-deploy 수동 배포 필요 |
| 2026-08-07 | 2차 감사(클라이언트·PWA / 스크립트·CI) High 4 + Medium 다수 해소 (048~052) | purge·rx-handoff·api-error·pharmacy-auth(신규 4)·migrations 048~052·로그아웃 3곳·push 3파일·create-pharmacy-account·migrate·ci.yml·e2e/_env·API 24곳·next.config·landing vercel.json | **H(계정경계)**: 로그아웃 3곳이 `sessionStorage` 를 안 지우고 `ocr-uploader` 가 핸드오프를 소유자·만료 검증 없이 픽업 → 공용 기기에서 **이전 사용자 처방전 사진**이 넘어갔다(설치형 PWA 는 앱=탭이라 로그아웃/로그인 사이 생존). `lib/purge`(SSOT: 푸시해제→signOut→local/session/쿠키 파기) + `lib/rx-handoff`(uid·5분 TTL 봉인, 검증 실패해도 항상 파기)로 해소. **H(푸시)**: 유니크가 `(user_id,endpoint)` 라 한 기기에 두 계정이 매핑 — **운영에서 실제 발생 중이었다**(개화약국 약사 + 환자, 6/24·7/2). 048 로 `endpoint` 단독 유니크 전환(중복 1건 정리) + subscribe 인수인계 + `push.ts` 만료정리에 user 스코프 추가(누락 시 타인 구독까지 삭제). 약사 회신 푸시 본문은 원문→고정문구(잠금화면 노출 차단). **H(약국계정)**: `--password` argv 금지(히스토리·ps 잔존) → CSPRNG 24자 자동생성·1회 출력, store_id `Math.random`→CSPRNG. **049**: `handle_new_user` 가 여전히 가입 메타 `role` 을 신뢰해 `signUp({data:{role:'pharmacist'}})` 로 자기 승격이 가능했다(046 은 UPDATE 만 막았음) → `'patient'` 고정, 실증 테스트로 차단 확인. **H(운영DB 가드)**: ci.yml `permissions: contents:read` + 운영 ref 시크릿 비교 차단 + heredoc→env/printf(시크릿 내 `$`·백틱 확장 방지), `e2e/_env` 는 대상 프로젝트 항상 표기 + CI fail-closed(4분기 테스트). **050**: 탈퇴 시 `user_medications·medication_check_logs·medication_schedules·members·push_subscriptions·pharmacies` 가 남던 FK CASCADE 누락 보강(약관·처리방침의 "지체 없이 파기" 약속 이행) — 생성→삭제 기능테스트로 확인. **051**: 약사가 환자 `profiles` 행 전체(email·phone·alarm_times 등)를 볼 수 있던 것을 3컬럼 뷰로 축소, 행 정책 제거로 직접조회 차단(RLS 는 컬럼을 못 막으므로 definer 뷰 불가피 — advisor ERROR 는 의도된 결과, `security_barrier` 로 술어누수 차단). **052**: waitlist email 길이·형식 CHECK, 죽은 레거시 `prescriptions`·`pharmacy_patients`(0행·참조0) 정책·권한 제거로 무력화(DROP 은 비가역이라 선택지로 남김). **M**: DB 오류 원문 노출 24곳→`dbError()`(원문은 서버 로그만), 약사 라우트 3곳에 `ownedPharmacyId` 앱계층 검증+`pharmacy_id` 명시(환자가 자기 요청 상태 조작·푸시 스푸핑 차단), `migrate.mjs` TLS 검증 활성+argv 비번 금지+전체일괄 실행 방지, ETL `http→https`(TLS 지원 실측), CSP 실측 오리진 기반 전면 강화(앱·랜딩) — 로컬 프로덕션 빌드를 **크롬으로 로드해 위반 0건 확인**, shadcn devDep 제거로 취약점 8→0, sw.js 알림 URL 검증·근거링크 스킴검증·tel 정규화. 검증: tsc·lint 0·build·unit 55/55·**E2E 11/11(약사 RLS 21→23)**·audit 0 |
| 2026-08-07 | 8차 평가(UX 92·기술 90·제품 96, 종합 92.7) + 회귀 4건 즉시 수정 (053) | migrations/053·e2e/pharmacist-rls-qa·ocr 2라우트·box-ocr-scanner·drugs 2라우트·pharmacies/search | 평가가 **당일 작업의 결함 4건**을 잡았다. **H1(가장 중요)**: 051 의 REVOKE 가 `FROM PUBLIC, anon` 만 지정해 **authenticated 를 빠뜨렸고**, Supabase 가 뷰 생성 시 authenticated 에 ALL 을 기본 부여하므로 뒤이은 GRANT SELECT 가 아무것도 좁히지 못했다(실측 `authenticated=arwdDxtm`). 뷰가 auto-updatable + 정의자 실행이라 약사가 `DELETE /rest/v1/pharmacist_patient_view?id=eq.<환자>` 로 환자 profiles 행을 통째로 삭제 가능 — RLS 와 046 컬럼 GRANT 를 **둘 다 우회**. 근본원인은 e2e [E] 가 기반 테이블 UPDATE 만 검증해 뷰 경유를 놓친 것 → 뷰 UPDATE·DELETE 단언 추가(21→27). **M1**: 쿼터가 파일 검증보다 먼저 차감돼 413 도 하루치 소모 + 재시도로 최대 3배 → 검증 후로 이동. **M2**: `box-ocr-scanner` 가 `res.ok` 미검사로 429·401 을 "제품명을 못 읽었어요"로 표시 → 응답 가드. **M3**: `QUOTAS.publicApi` 선언만 되고 소비처 0 → drugs/info·pharmacies/search 게이트, drugs/search 는 외부 보완 지점에만 걸어 초과 시 429 대신 로컬 43k 축소 |
| 2026-08-08 | 8차 잔여 개선 — 탈퇴 기능·글자크기 복원·처리방침 형식요건·기술부채 | font-size(신규)·api/profile/delete(신규)·(main)/layout·purge·settings·privacy·terms·ocr-uploader·home·push/subscribe·api-error·patients/[id]·ui 7개 삭제 | **UX H2**: 재로그인 시 글자크기 16px 초기화 — 루트 FOUC 스크립트가 localStorage 만 읽고 서버값은 /settings 진입 시에만 복원됐다. `lib/font-size` SSOT 신설 + `(main)` 레이아웃(이미 profiles 조회 중 → 비용 0)에서 서버값 주입 + **로그아웃 시 글자크기만 보존**(접근성 설정이지 개인정보가 아니다). 정적 페이지는 레이아웃 밖이라 영향 없음. **제품 P-M1**: 회원 탈퇴 기능 신설 — 약관·처리방침이 "지체 없이 파기"를 약속했으나 UI 가 없었다. `/api/profile/delete`(본인만, 약사 계정은 403 — CASCADE 로 약국·QR·요청이력까지 증발하므로) + '탈퇴' 직접 입력 확인 모달. 임시계정으로 6개 테이블 전부 파기 실측. **처리방침**: 보유기간표·보호책임자(성명은 법정기재사항이라 **플레이스홀더**, 임의 기재 금지 주석)·권익침해 구제(4개 기관)·만14세 조항 신설, 제9조에 권리행사 경로 구체화, **제7조 국외이전 거부 수단 명시**(거부권만 있고 방법이 없었음), 약관 제8조도 앱 경로와 일치화. ※ 초안에 "가입 시 만14세 확인" 을 썼다가 **실제 연령 게이트가 없음을 확인하고 사실대로 정정** — 허위 기재 방지. **UX M**: OCR 429/401 시 재시도 버튼 숨김(확정 실패 반복 방지)·폴백 문구, 약사 회신 푸시를 `/settings`→`/medications/pharmacy-request` 딥링크, 홈 멤버 라벨 중복 제거(MemberContextBar 와 이중 표시). **기술**: `dbError` 에 code·details·hint 보존, push admin 실행을 **충돌(23505/42501) 시로 축소**(상시 특권 경로 제거), `ownedPharmacyId` SSOT 미적용 1곳 적용, `lucide-react` + `components/ui` 7개 데드코드 제거, 038 번호 중복 해소. 검증: tsc·lint 0·build·unit 55/55·E2E 11/11·audit 0 |
| 2026-08-11 | 약사 대시보드 무한 리다이렉트 — 050 이 끊은 FK 관계 (4일간 진입 불가, PR #45) | pharmacy/(app)/layout·e2e/pharmacist-rls-qa | 약사가 `/pharmacy` 에 **들어갈 수 없었다.** 서버는 200 을 주고 500 도 안 나 모니터링에 안 잡혔고, 브라우저만 `ERR_TOO_MANY_REDIRECTS` 로 죽었다. **원인**: 050 이 탈퇴 CASCADE 를 붙이려 `pharmacies.owner_id` FK 를 `profiles(id)`→`auth.users(id)` 로 옮기면서 `profiles ↔ pharmacies` 의 `owner_id` 관계가 사라졌고, 레이아웃의 `pharmacies!owner_id(name)` 임베드가 **PGRST200** 으로 죽었다. 쿼리 실패 → `profile=null` → role 판독 불가 → '약사 아님' 으로 강등 → `/home`, 그런데 `(main)/layout` 은 `role='pharmacist'` 를 멀쩡히 읽어 다시 `/pharmacy` 로 → **무한 루프**(Vercel 로그 실측). **두 가드가 같은 사실을 다르게 읽은 것이 루프의 본질.** → role 판독과 약국명 조회를 분리(권한 판정이 FK 배치에 인질로 잡히지 않게) + 판독 실패를 '약사 아님' 으로 강등하지 않음(권한은 안 열되 튕기지 말고 실패시킴). DB 변경 없음 — 050 의 `auth.users` FK 는 CASCADE 상 그대로가 맞다. **왜 못 잡았나**: e2e `[A]~[E]` 는 "약사가 무엇을 못 보는가" 만 봤고 "약사가 들어가지는가" 는 아무도 안 봤다 → `[F]` 추가. 그 과정에 시드가 약사 `role` 승격을 빠뜨린 것도 발견(RLS 는 `owner_id` 로 판정해 `[A]~[E]` 는 통과했고 role 기반 라우트 가드만 검증 밖) → 발급 스크립트와 일치화. 검증: 수정 전 `[F]` 가 `role=null` 로 실패(프로덕션 증상 일치) → 수정 후 e2e 30/30 |
| 2026-08-11 | 9차 평가 종합 82.7 (UX 89·기술 79·제품 80) — **실사용 검증 도입** | _workspace/eval(9차)·eval_8th_2026-08-07(8차 보존) | **점수 하락은 제품이 나빠져서가 아니라 자를 바꾼 결과다.** 8차까지 8회는 전부 코드를 읽어 채점했고, 그 8회 내내 약사 제품이 죽어 있는 걸 몰랐다. 8차 렌즈로만 재채점하면 오히려 **95점대**(8차 지적 16건 대부분 해소, 세 에이전트 모두 **오지적 0건**). 하락분 전부가 이번에 새로 센 "화면이 열리는가 / 운영에서 살아 있는가" 항목 → **92.7 이 과대평가였고 82.7 이 실제에 가깝다.** **신규 축(실사용 검증)**: 라이브를 비로그인·약사 두 세션으로 전수 타격 — 페이지 22개 리다이렉트 **루프 0**, API 30개 **전부 게이트**(빈쿼리 200 은 조기반환, 실쿼리 401), 보안헤더 **6/6**, QR 진입 정상, SW navigate=network-first, PostgREST 임베드 19건↔FK **어긋남 0**. **발견**: ①프로덕션 배포 **ERROR**(→ 다음 행) ②`database.ts` 가 "001~030 기준" 이라 050 이후에도 `pharmacies_owner_id_fkey→profiles` 를 선언 → **타입이 거짓말해 죽은 쿼리가 tsc·lint·CI·build 를 전부 초록 통과**(근본 조력자) ③환자 스모크 `e2e/run.mjs` 가 **오래전부터 빨간불인데 "E2E 11/11 통과" 로 보고돼 왔다** — Playwright 실측 결과 앱은 정상이고 테스트가 낡음(라벨 `한번에 먹기`→`지금 먹기`) ④에러추적·헬스체크·배포후 스모크 **전부 0**, 리필 리마인더 **10주간 발송 0**(cron 이 DB 에러를 `{sent:0}`+200 으로 번역) ⑤운영 실측: 마지막 복약체크 7/03, 가입 8명 중 약 등록 2명 → **장애를 신고할 사용자가 없었다**. 권고: B2C 는 서비스 가능하나 **B2B 유료 영업은 운영 가시성 확보 전까지 보류** |
| 2026-08-11 | 9차 Critical 2 + High 1 — 빌드 차단 해제·실패 착지 화면·탈퇴 fail-open (PR #46) | tsconfig·api/profile/delete·app/error·global-error·not-found·pharmacy/error·components/yc/failure-screen(신규 5) | 셋 다 **"실패했을 때 어떻게 되는가"** 라는 같은 질문에 걸렸다. **C1**: `ter-notify` 커밋들이 Deno 코드를 저장소에 들이면서 `tsconfig` 의 `include:["**/*.ts"]`(exclude 는 node_modules 뿐)에 걸려 `TS2304: Cannot find name 'Deno'` 11건 → `build` exit 1 → **Vercel 프로덕션 배포 readyState=ERROR**. 라이브는 마지막 성공 배포를 서빙해 사용자 영향은 없었지만 **당일 고친 4일짜리 장애의 후속 핫픽스조차 나갈 수 없었다** → `exclude` 에 `supabase/functions` 추가(Edge Function 은 Deno 툴체인이 검사할 코드). **C2**: `error.tsx`·`global-error.tsx`·`not-found.tsx` 가 **전역 0개**라, 루프를 막으려 넣은 `throw` 가 영문 "Application error" 로 떨어지고 레이아웃이 던져 헤더 미렌더 → **로그아웃 버튼조차 없이 갇힘**(설치형 PWA 는 주소창이 없어 강제종료가 유일한 탈출구). 루프 대신 다른 방으로 갇힌 셈이라 결과는 동일했다 → 공통 `failure-screen`(한국어·이동수단 필수·터치 48px) + 4개 경계 신설. **`pharmacy/error.tsx` 는 위치가 핵심** — `(app)/layout.tsx` 의 예외는 같은 세그먼트 `error.tsx` 로 안 잡히므로 라우트 그룹 **바깥**에 두고, 루트의 "홈으로"(`/home`)는 약사를 다시 `/pharmacy` 로 돌려보내므로 실제 탈출구인 **로그아웃**을 화면 안에 둠. `global-error` 는 공용 컴포넌트를 **일부러 안 씀**(마지막 그물은 스스로 서야 한다). **H1**: `api/profile/delete` 가 `error` 를 버리고 `profile?.role` 만 봐 조회 실패 시 null → 약사 가드 통과 → **비가역 CASCADE 삭제**(fail-**open**) → error·null 이면 503 중단. 검증: **프로덕션 빌드로 경계를 실제로 터뜨려** 확인(dev 는 에러 오버레이가 가려 판정 불가) — 세션 없는 컨텍스트에서 HTTP 500 + "약국 화면을 불러오지 못했어요·[다시 시도][로그아웃]·오류코드" 렌더, 404 한국어 화면 라이브 실측. tsc·lint 0·build·unit 55/55·E2E 13/15(실패 2건은 이 변경 이전부터 빨간불). **잔여**: `proxy.ts` 등 강등 3곳(같은 루프 재현 가능)·Sentry 연결·`database.ts` 재생성+스키마↔타입 CI·`e2e/run.mjs` 라벨 최신화 |
| 2026-08-11 | 9차 H1 후속 — 강등 4곳 봉합 · 입구 HTTP 실측 · dev 하이드레이션 · QR 쿠키 층 복원 (PR #48) | proxy·pharmacy/(app)/page·qr·login·lib/active-member·next.config·login/page+login-client(분리)·landing·e2e/pharmacy-entry-qa(신규) | 강등 잔여를 고치러 들어갔다가 **무증상 결함 3건**이 더 나왔다. **① 강등 봉합**: 아침 수정은 세 가드 중 하나뿐이었다. `proxy.ts` 는 레이아웃보다 **먼저** 돌아 거기서 튕기면 새 `throw` 는 실행조차 안 되고 같은 루프가 재현된다 → 판독 실패 시 **판정하지 않고 통과**(권한은 안 열린다 — 레이아웃이 fail-closed 로 막고 `pharmacy/error.tsx` 가 받는다). 미들웨어는 리다이렉트만 할 수 있어 갇힘·루프를 만들기 쉬우므로 **확신이 없으면 화면을 그릴 수 있는 계층에 넘긴다.** 대시보드는 조회 실패를 빈 배열로 흘려 "환자 0명·요청 없음"(약사 눈에는 장애가 아니라 **평온한 하루**)이 되던 것을 throw 로, qr 은 '약국 행 없음' 을 로그인으로 보내 **메뉴 무반응**으로 보이던 것을 화면 설명으로, login 은 판독 실패를 "약사 계정이 아닙니다" 로 말하던 것을 정정. **② 신규 계정 첫 화면이 항상 500**: `(main)` 이 탭 5종을 병렬 슬롯으로 동시 렌더 → `getActiveMember` 가 한 요청에 5번 돌며 자기 멤버 생성이 경합, `uq_members_one_self` 로 4개가 23505(실측). 진 쪽이 에러를 버려 `active=undefined` 인데 반환 타입은 `Member`(**타입이 거짓말**) → 호출부가 `active.id` 에서 터짐. 새로고침하면 나아 재현이 어려웠다. ⚠️ 재조회는 앞 SELECT 와 **쿼리 모양이 달라야 한다** — Next 가 한 렌더 패스의 동일 GET fetch 를 메모이제이션해 insert 이전의 **캐시된 0행**을 돌려준다(동일 쿼리 3/3 500 → `is_self` 추가 3/3 정상, 실측). **③ CSP 가 dev 하이드레이션을 막고 있었다**: 8/7 이후 **로컬 개발 전체가 비상호작용**(webpack HMR 의 eval 차단 → `NOT-hydrated` 실측, prod 는 hydrated). 화면은 그려지니 눈으로는 멀쩡. 파급으로 Playwright e2e 가 무더기 오탐 실패했고 나는 이를 "테스트가 낡았다" 고 **오판했다** — 수정 후 `run` 이 그대로 초록. `'unsafe-eval'` 은 **개발 모드에서만** 허용(운영 CSP 불변). **④ QR 쿠키 층 사망**: 8/7 이 `pending_pharmacy_id` 를 httpOnly 로 바꿨는데 읽는 2곳이 `document.cookie` 를 써 **항상 null** → 3중 방어 중 **인앱 브라우저 담당 층**이 죽음. httpOnly 유지한 채 **서버가 읽어 prop 전달**(login 을 서버 컴포넌트로 분리). 이 회귀는 `qr-social-sim` 이 계속 잡고 있었으나 ③의 소음에 신호가 묻혀 있었다. **⑤ e2e/pharmacy-entry-qa(신규)**: 감사가 "0건" 이라 한 자리 — `/pharmacy` 에 HTTP 요청을 보내 200 을 단언한다. 서버가 500 도 200 도 아닌 **307 을 무한히** 주는 유형은 **홉을 세는 주체**만 볼 수 있으므로 리다이렉트를 직접 따라가며 상한 초과를 루프로 판정. 검증: 신규 9/9 · **E2E 16/16 전체 통과(처음)** · unit 55/55 |
| 2026-08-11 | 9차 H2 — 타입 진실화 + 임베드 정합성 검사 신설 (PR #49) | src/types/database.ts(001~055 재생성)·e2e/embed-integrity-qa(신규)·run-all·qr-social-sim 주석 | 오늘 장애가 **CI 를 초록으로 통과한 근본 조력자**를 없앤다. `database.ts` 가 "001~030 기준(6/22)" 에서 멈춰 050 이후에도 `pharmacies_owner_id_fkey → profiles` 를 선언 → **이미 죽은 임베드가 tsc·lint·CI·build 를 전부 통과**했다. **타입이 스키마보다 오래되면 타입 검사는 안전망이 아니라 위장막이다.** 재생성으로 거짓 관계 제거 + 누락 테이블 3개(`api_quota`·`waitlist`·`ter_requests`) 편입. **재발 방지는 타입이 아니라 실질의로** — 임베드 해석은 컴파일 타임이 아니라 **런타임에 PostgREST 가 스키마 캐시로** 하는 일이라 타입 검사로는 원리적으로 못 잡는다. `src` 전체에서 `.from().select()` 쌍을 뽑아 19건을 익명 키로 실제 질의(관계 오류 PGRST200/201 은 RLS 평가보다 **먼저** 나므로 "관계 파손"(400)과 "권한상 0행"(200)이 구분된다 — 로그인·서버 불필요). **테스트가 실제로 잡는지 증명**: 깨졌던 임베드를 되살리자 19/20 FAIL → 되돌리자 19/19 PASS. **실패할 수 없는 테스트는 안전망이 아니다.** 덤: `qr-social-sim` 플래키를 대기 부족으로 보고 타임아웃을 25초로 늘렸으나 그대로 → 프로덕션 빌드에선 3회 연속 19/19 → **dev 아티팩트**임을 주석에 사실대로 정정 |
| 2026-08-11 | 9차 H5 — cron 을 조용히 성공하지 못하게 + 배포 후 운영 스모크 (PR #50) | lib/cron-guard(신규)+테스트 5·cron 2종·scripts/smoke-production(신규)·.github/workflows/smoke(신규)·ci.yml | "4일간 아무도 몰랐다" 에 대한 답. 장애를 못 고친 게 아니라 **장애가 났다는 사실이 어디에도 나타나지 않았다.** **① cron 이 실패를 성공으로 번역**: 조회 실패 → 빈 배열 → "구독자 없음" → `{sent:0}` + **HTTP 200** → Vercel 은 성공으로 기록. 실측상 처방 49건 전부 `refill_reminded_at` null 인데 조건 충족 18건 — **10주간 발송 0, 확인 방법도 없었다.** "보낼 사람이 없었다" 와 "물어보지 못했다" 는 다른 사건이므로 후자는 500 으로 알린다(조회 4곳씩 + 발송기록 update 까지 가드, 기록 실패를 흘리면 다음 실행이 같은 사람에게 또 보낸다). `cron-guard` 는 `next/server` 를 **일부러 import 하지 않는다** — Next 런타임에 묶이면 단위 테스트에서 로드할 수 없다. **조용한 실패를 막는 장치일수록 스스로 검증 가능해야 한다.** **② 배포 후 스모크**: "배포 성공" 은 "앱이 열린다" 가 아니다(8/11 에 빌드·배포 모두 성공이었고 서버는 307 을 무한히 줬다). 익명 경로만 보므로 CI 에 시크릿 불필요 — 공개화면 4·보호경로 3(루프 감지)·404 한국어 착지·보안헤더 4종 + **운영 CSP 에 'unsafe-eval' 이 새지 않았는지**까지 11단언. Vercel 프로덕션 배포 성공 시 자동 실행(프리뷰는 skip). 실측: 운영 11/11, 실제 배포에서 워크플로 자동 실행 성공(17초). ci.yml 의 "단위테스트 36건" 라벨 제거(실제 60건 — 늘 때마다 어긋나 결국 아무도 안 믿는 숫자) |
| 2026-08-11 | Sentry 연결 + logger 브리지 수정 (PR #51) | lib/sentry-init·instrumentation·instrumentation-client(신규)·lib/logger·next.config(CSP)·vercel-env-setup·.env.example | 관측의 마지막 조각. **DSN 이 없으면 아무 것도 하지 않는다**(로컬·프리뷰 조용히 비활성, 환경변수 하나로 켜짐). `setLogReporter` 로 코드 전역 `logger.error/warn` 이 그대로 흐르므로 **호출부는 한 줄도 안 고쳤다**. `onRequestError` 로 서버 컴포넌트 throw 도 잡는다 — 화면(`pharmacy/error.tsx`)은 사용자를 구하고 이건 우리에게 알린다. **건강정보 차단**: `sendDefaultPii:false` 명시 + `beforeSend` 에서 query_string·cookies·request data 제거, `tracesSampleRate:0`(지금 필요한 건 장애 인지이지 트레이스가 아니다), environment·release(커밋 SHA)는 넣는다. **CSP 에 ingest 오리진 추가** — 안 넣으면 이벤트가 CSP 로 조용히 차단돼 **장애를 알아차리는 장치가 자기 실패를 못 알린다**(dev 하이드레이션과 같은 유형). ★ **실측하다 자기 결함을 잡았다**: throw 는 도달했는데 `logger.error` 는 **0건**이었다. Next 가 instrumentation·route handler·클라이언트를 서로 다른 번들로 만들어 각자 logger 모듈의 별도 사본을 갖는 탓 — 등록은 성공하고 전송만 조용히 안 되는, 이번 주 내내 쫓던 그 유형이다. 수집기를 `Symbol.for(globalThis)` 로 옮겨 해결(logger 는 여전히 Sentry 무의존). 프로브 3회로 검증: 수정 전 2회→2건(throw 만), 수정 후 1회→**2건(throw+logger, scope 태그·extra.message 도달 확인)**. ※ 두 에러는 같은 함수에서 만들어져 스택이 거의 같아 Sentry 가 **한 이슈로 묶는다** — "이슈 1개" 를 "전송 실패" 로 오독하지 말 것. ⚠️ **운영 DSN 미주입 상태** — Vercel 환경변수 `NEXT_PUBLIC_SENTRY_DSN`(Production+Preview) 등록 후 재배포해야 활성(저장된 Vercel 토큰 403 이라 대시보드에서 수동). Sentry 조직 `yaksaro` / 프로젝트 `javascript-nextjs` |
| 2026-08-12 | 10차 평가 종합 87.0 (UX 90·기술 84·제품 87, 9차 82.7 대비 +4.3) — **반사실 검증** 도입 | _workspace/eval(10차)·eval_9th_2026-08-11(9차 보존) | Critical 0 · High 5 · **세 에이전트 모두 오지적 0건**. 이 라운드의 한 문장: **"어제 만든 안전망은 대부분 켜지지 않았거나, 켜면 위험하거나, 엉뚱한 곳을 겨냥하고 있었다."** 8/7 장애에 8/11 장치를 되돌려보는 **반사실 검증**이 결정적이었다 — 익명 스모크는 `/pharmacy → /pharmacy/login 200` 으로 **깨진 코드에 도달조차 못 해 11/11 PASS** 했을 것이고, 신규 스위트 2종은 **CI 자동 실행 0회**, Sentry 는 운영 청크 14개에 **DSN 0건 → 수집 0**, 스모크에 `schedule:` 이 없어 **배포 없이 SQL Editor 로 마이그레이션을 적용하는 이 프로젝트의 표준 방식**(8/7 의 050)은 무감시였다. **반대로 8/11 수정은 진짜였다** — proxy 통과가 권한 우회가 되는지 경로 전수 조사(우회 없음), 타입 재생성본 완전 일치, 임베드 19/19, 메모이제이션 주장 사실 확인. **9차 오지적 정정**: `pg_stat_statements` 로 cron 5종이 50일간 매일 정상 실행 중임을 확정(호출 242회 등) — 리필 0건은 **조건 미달**이 원인이고 9차의 "조건 충족 18건" 은 활성 복약 조인 누락. **최대 발견**: 신규 가입자 첫 화면이 **48일간 500** 이었고(7/02~7/03 가입 5명 전원 self 멤버가 가입 2~7초 후 생성, 4명 재방문 0) → "사용자가 없어 장애를 몰랐다" 가 아니라 **"첫 화면이 깨져 사용자가 남지 않았다"** 가 순서다 |
| 2026-08-12 | 10차 High 5건 전부 처리 (PR #53~#56) | e2e/_env·lib/sentry-init·evidence·privacy·app/error·(main)/error·pharmacy/(app)/error(신규)·failure-screen·global-error·ci.yml·smoke.yml·embed-integrity·medications/pharmacy-request·settings/pharmacy-request·store/[id]·store-unknown(신규) | **H1(#53) e2e 16종이 설치 다음 날 침묵했다 — 원인 제공은 이 작업이다.** `_env.mjs` 가 `\n` 으로만 쪼개 줄 끝 `\r` 이 남았는데 JS 정규식의 `.` 은 `\r` 을 매치하지 않아 `(.*)$` 가 어긋나 **키가 0개**가 된다(키 23개가 파일에 다 있는데 파싱 0줄). 계기는 Sentry DSN 을 빼려고 `.env.local` 을 파이썬으로 다시 쓴 것 — Windows 텍스트 모드가 파일 전체를 CRLF 로 바꿨다. **한 번의 재작성이 게이트 전부를 껐고 그 사실은 아무 데도 나타나지 않았다.** CRLF·BOM 내성으로 고치고 **파일은 일부러 CRLF 인 채로 두고 검증**(되돌리면 증상만 지우는 것). **H2(#54) Sentry 를 켰으면 처방·복약이 나갔다** — 어제 넣은 `beforeSend` 가 지운 `query_string`·`cookies`·`data` 는 **이 앱에서 채워지지 않는 필드**였다(아무것도 막고 있지 않았다). 실제 경로는 브레드크럼(fetch URL `?q=<약품명>`, `ui.click` 의 `alt`/`aria-label` — 약 이미지 `alt={약이름}`·멤버 스위처의 **가족 실명**, console 인자)과 `request.url`·`Referer`. → `beforeBreadcrumb` 로 `ui.*`·`console` 통째 폐기 + URL 쿼리 절단, `evidence` 가 `dn:와파린+오메가3` 를 로그에 싣던 것은 길이만, **처리방침에 Sentry 기재**(0건이었다). **H3·M1·M2(#54) 실패 화면의 다음 걸음이 실패 지점으로 돌아갔다** — `pharmacy/error` 에는 "`/home` 은 약사를 같은 실패로 되돌린다" 며 로그아웃을 뒀는데 **루트 `error.tsx` 가 같은 상태**였고, 8/11 에 넣은 `active-member` 의 throw 가 그 경로를 새로 만들었다 → 로그아웃 추가 + `(main)/error`(슬롯 하나가 탭바까지 날리던 것)·`pharmacy/(app)/error`(페이지 실패에 로그아웃을 권하던 것) 신설. **M3** 오류 코드 대비 2.26:1 → 하필 **사용자가 읽어 문의에 전달해야 하는** 문자열이라 상향. **(#55) 만든 감시가 실제로 돌게** — `schema-gate` CI 잡 신설(운영 스키마 대상, **anon 키만 주어 쓰기 능력 자체를 없애** guardTarget 과 양립: 방어를 우회한 게 아니라 전제를 없앴다) + ci/smoke 에 하루 2회 `schedule:`. **H4·H5(#56)** 단골 연결이 끊기면 **이미 도착한 약사 회신이 영구 도달 불가**였고(끊기는 경로 3개, 그동안 약사 화면엔 "회신함") → 이력이 있으면 보내기만 닫고 읽기는 유지. 죽은 QR 은 무음 `/` → 로그인 상태면 `/wallet` 이라 **성공과 픽셀 단위로 같은 결과**였다 → `/store-unknown` 전용 안내. 검증: 프로덕션 빌드로 경계를 실제로 터뜨림(@calendar throw → 탭바·나머지 패널 생존, 약사 qr throw → 헤더 생존·[대시보드로]) |
| 2026-08-12 | 약사 보드 할 일을 일자별 스케줄로 (PR #57, 056) | migrations/056·pharmacy-day-schedule(신규)·pharmacy-calendar·pharmacy-todo-list·pharmacy-status-board·api/pharmacy/todo·lib/pharmacy-board·types/database·specs 문서 | 약사 요청: **"오늘 해야 할 일인데 그 오늘이 언제인지 구분할 수가 없다."** 045 의 `pharmacy_todos` 에 **날짜 필드가 없어** 한 번 적으면 완료할 때까지 남았고, 캘린더는 옆에서 요청 마감·리필만 보여줄 뿐 할 일과 연결돼 있지 않았다. **056**: `due_date` 추가 + 기존 행을 `created_at` 의 **KST 날짜**로 백필(그냥 `::date` 로 자르면 한국시간 밤 9시 이후 메모가 하루 전으로 밀리는데, **약국은 저녁에 다음날 발주 메모를 적는 일이 흔해** 실제로 눈에 띈다). 값은 앱이 `todayKST()` 로 명시 — 캘린더에서 **다른 날짜를 골라 적는 것**이 핵심이라 서버 기본값에 맡길 수 없다. **화면**: 캘린더가 이미 갖고 있던 선택 상태를 새 컨테이너로 끌어올려 할 일 패널이 같은 날을 보게 함 → 헤더가 `오늘 · 8월 12일 (수) 할 일` 처럼 **날짜를 말한다**(요청의 핵심). 메모는 선택 날짜에 저장, 캘린더 셀에 메모 있는 날 회색 점, 다른 날이면 '오늘로'. **밀린 일**: 지난 미완료를 **오늘을 볼 때만** 위에 묶고 원래 날짜(8/10) 표기 — **날짜를 바꾸지 않는다**(언제 하려던 일이었는지가 남아야 다음 일정을 잡을 때 판단이 선다). 배경으로 묶었다(선만 그으면 그날 목록 첫 항목처럼 읽혀 실제로 그렇게 보였다). 목록→입력 순서(입력창이 위면 경계가 흐려진다). ※ 중간에 `page.tsx` 조회에서 `due_date` 를 빼먹어 **메모가 하나도 없는 것처럼** 보였다 — 날짜로 거르는 구조라 조용히 빈 목록이 되는 유형이라 프로브가 없었으면 놓쳤을 것 |
| 2026-08-12 | Sentry 운영 활성 + 유출 실측 | Vercel env(NEXT_PUBLIC_SENTRY_DSN) | 배선(#51)·유출 차단(#54) 이후 실제로 켰다. Sentry 조직 `yaksaro` / 프로젝트 `javascript-nextjs`. ⚠️ **함정 2개**: ① Vercel CLI 가 기본으로 `Sensitive` 타입으로 등록하는데 **그 타입은 빌드에 값이 전달되지 않는다** — `NEXT_PUBLIC_*` 은 빌드 때 인라인돼야 하므로 번들이 비었다. 로컬 빌드는 인라인되는데 운영만 안 되는 것으로 원인을 갈랐고 `--no-sensitive` 로 재등록. ② `vercel redeploy <url>` 에 넘긴 URL 이 **오래된 배포(PR #46 시절)** 였다 — 재배포는 그 배포를 되살리므로 잠시 구버전이 걸릴 수 있다. **URL 을 넘기지 말고 `vercel deploy --prod` 로 새 빌드를 만들 것.** 검증: 운영 청크에 DSN 인라인 확인 · `sentryLoaded: true` · 실제 에러 도달 · **유출 실측**(일부러 심은 `?q=와파린` fetch·`console.error('… 김상우 … 와파린')`·클릭 텍스트가 이벤트에 **하나도 안 남고** `url` 은 쿼리가 잘려 기록됨) · 스모크 11/11. **잔여**: 이벤트에 `user.geo`(도시 단위)가 붙는다 — Sentry 프로젝트 Settings → Security & Privacy → "Prevent Storing of IP Addresses" 권장(MCP 로는 변경 불가) |

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
