---
name: pharmacy-dashboard-build
description: 약사로케어 약사 모드(약국 read-only 대시보드) 백엔드·프론트엔드를 구현한다. 환자측 '단골 약사에게 내 약 공개' opt-in 동의 토글, role 가드 미들웨어(/pharmacy/*는 약사만), 약사 사용자 토큰+RLS 기반 read-only 조회(연결+동의 단골 환자 목록·복약·검색), 데이터 밀도형 대시보드 UI(YC 토큰). "약사 모드 구현", "약국 대시보드", "약사 화면", "단골 환자 목록", "약사 동의 토글", "/pharmacy 라우트", "약사 read-only 조회" 작업 시 반드시 사용. backend-engineer·frontend-engineer가 이 스킬을 사용한다.
---

# Pharmacy Dashboard Build — 약사 모드 구현

약사가 동의한 단골 환자의 복약을 **읽기 전용**으로 보는 대시보드를 만든다. 환자용 화면이 아니라 **약사용 B2B 도구**이므로 UX 가정(실버 단일사용자)이 다르다.

## 0. 선행 확인 (착수 전)

- `_workspace/pharmacy/01_regulatory.md`(동의·표현 요건), `02_architecture.md`(동의 저장 방식·RLS·API·데이터모델 확정안)
- 실제 인프라: `profiles.role`('patient'|'pharmacist'), `profiles.regular_pharmacy_id`(QR 단골), `pharmacies.owner_id`(약국=약사 profile), `src/lib/supabase/proxy.ts`(미들웨어 보호경로), `src/components/dashboard/nav.tsx`(role 분기 없음)
- 디자인 토큰: `src/app/globals.css`(yc-*)·`src/components/yc/*`

## 1. 환자측 — '약사 열람 동의' opt-in (관계 ≠ 동의)

QR 단골(`regular_pharmacy_id`)은 관계일 뿐이다. 약사가 민감 복약을 보려면 환자의 **명시적 동의**가 따로 필요하다(개인정보보호법 민감정보).
- 설정(`/settings`)에 토글 추가: **"단골 약사에게 내 약 목록 공개"** (기본 OFF, opt-in). 02_architecture가 정한 동의 컬럼/테이블에 저장 + `consent_at` 기록.
- 동의 문구는 01_regulatory 확정안 사용(누구에게·무엇을·철회 가능 명시). 끄면 **즉시** 약사 접근 차단(RLS가 재평가).
- 단골약국이 없으면 토글 비활성 + 안내("QR로 단골약국을 먼저 연결하세요").

## 2. role 가드 (약사 전용 영역)

- `src/lib/supabase/proxy.ts` 보호경로에 `/pharmacy` 추가하고, **role 분기**: `/pharmacy/*`는 `profiles.role='pharmacist'`만 통과(환자는 `/home`으로). 역으로 약사가 환자 전용 화면에 들어가도 깨지지 않게.
- 약사 진입점: 로그인 후 role='pharmacist'면 `/pharmacy`로(환자는 `/home`/`/wallet`). `src/app/dashboard/page.tsx`(현재 /wallet redirect)를 role 분기 지점으로 활용 가능.
- 네비: 약사용은 환자 탭바(`nav.tsx`)와 분리된 최소 네비(또는 대시보드 단일 화면).

## 3. read-only 조회 (사용자 토큰 + RLS, admin 금지)

**핵심 보안 계율:** 약사 데이터 조회는 **약사 사용자 토큰 기반 server client**(`@/lib/supabase/server`)로만. `createAdminClient()`(service_role)로 환자 데이터를 조회하지 말 것 — RLS 우회 = 누수. (admin은 RLS 무관 쓰기 동기화에만.)
- **단골 환자 목록**: 약사 약국에 연결(`regular_pharmacy_id`)되고 동의한 환자만. RLS가 막아주지만, 쿼리도 명시적으로 동의 환자만 select.
- **환자별 복약**: `user_medications`(+drug/supplement 조인)·`user_prescriptions`를 **읽기 전용** 표시. 환자 화면 컴포넌트(med-card-item 등)를 재사용하되 **수정/삭제 버튼 제거**.
- **검색**: 환자 이름/약품명 검색(동의 환자 범위 내).
- 노출 최소화: 대시보드에 필요한 필드만(주민번호·민감 식별자 제외).

## 4. 대시보드 UI (데이터 밀도형 read-only)

환자용 실버 UX와 다르다 — 약사는 여러 환자를 빠르게 훑는다.
- `src/app/pharmacy/*` 신규. YC 토큰/컴포넌트(`@/components/yc`) 재사용으로 디자인 일관성.
- 구성(MVP): 단골 환자 목록(이름·복약 종수·최근 업데이트) → 환자 선택 시 복약 상세(처방약/영양제/일반약, 읽기 전용) + 검색.
- **규제 안전(타협 불가):** 약사 화면이라도 앱은 **기록·참고 도구**다. 복용중단·처방변경·복약지도 *지시* 문구를 렌더하지 않는다. 상호작용은 안전 표현만("알려진 상호작용 정보가 있습니다"). 약사의 전문 판단을 대체/지시하지 않는다.
- 빈 상태: 동의 환자 0명일 때 "아직 약 목록을 공개한 단골 환자가 없어요" 안내.

## 5. 완료 기준

- `npx tsc --noEmit` + `npm run build` 통과.
- pharmacy-security-engineer의 누수 테스트(미동의·타약국·철회 환자 0건) 통과 후에만 완료.
- 약사 화면에 환자 데이터 수정/삭제 경로 없음(read-only) 확인.
- 산출 `_workspace/pharmacy/0X_*_output.md`에 변경 파일·보존 데이터·미해결 이슈 기록.

## 흔한 실수

- admin client로 환자 조회 → RLS 우회 누수. 사용자 토큰만.
- 동의 없이 단골(관계)만으로 노출 → 개인정보 위반.
- 환자용 med-card-item을 그대로 써서 수정/삭제 버튼이 약사 화면에 노출 → read-only 위반.
- role 가드 누락으로 환자가 `/pharmacy` 접근 or 약사가 환자 데이터 못 봄.
