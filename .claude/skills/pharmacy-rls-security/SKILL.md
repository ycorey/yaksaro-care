---
name: pharmacy-rls-security
description: 약사로케어 약사 모드에서 약사가 환자 복약을 읽는 역방향 접근의 RLS 정책 설계와 누수 보안 감사를 수행한다. 동의 게이트(약사 열람 동의 + QR 단골) RLS 패턴, 약사 토큰으로 미동의/타약국/철회 환자 SELECT가 0건임을 검증하는 누수 테스트, service_role 우회 탐지, 최소권한(SELECT 전용) 확인. "약사 RLS", "약사 모드 보안", "환자 데이터 누수 검증", "약사 열람 권한", "RLS 누수 테스트" 작업 시 반드시 사용. pharmacy-security-engineer 에이전트가 이 스킬을 사용한다.
---

# Pharmacy RLS Security — 약사 접근 보안 설계·감사

약사가 환자 민감 복약정보를 읽는 구조의 RLS를 설계하고, **누수 없음을 실증**한다. 핵심은 "있다/없다"가 아니라 **음성 테스트(미동의·타약국·철회 환자가 안 보임)를 코드로 assert**하는 것.

## 0. 선행 확인

- `_workspace/pharmacy/01_regulatory.md`(동의 요건), `02_architecture.md`(RLS 초안)
- 실제 스키마: `supabase/001_init.sql`(profiles.role, pharmacies.owner_id, 무효한 medications_pharmacist 정책), `003_dur_shadow_and_qr.sql`(profiles.regular_pharmacy_id), 약사 모드 마이그레이션(014_*)
- 약사 모드 조회 API/쿼리 구현부

## 1. RLS 정책 설계 패턴 (동의 게이트 AND 관계)

약사 SELECT 정책은 **관계(단골) AND 명시적 동의** 둘 다 참일 때만 허용. 한쪽만으로는 적법 근거가 안 된다.

핵심 형태(예시 — 실제 컬럼/테이블명은 02_architecture 확정안 사용):
```sql
-- user_medications에 대한 약사 SELECT
create policy "medications_pharmacist_view" on public.user_medications
for select using (
  exists (
    select 1
    from public.profiles p
    join public.pharmacies ph on ph.id = p.regular_pharmacy_id
    where p.id = user_medications.user_id          -- 그 환자의
      and ph.owner_id = auth.uid()                 -- 단골약국 owner가 = 지금 약사  (관계)
      and p.consent_pharmacist_view = true         -- 그리고 환자가 열람 동의함     (동의 게이트)
  )
)
```
원칙:
- **AND 조건 누락 금지**: `consent_*` 동의 컬럼이 빠지면 관계만으로 노출 → 위반. 반드시 포함.
- `user_prescriptions`·`profiles`(환자 이름 등)에도 **동일 게이트의 SELECT 정책**을 각각 추가. 한 테이블만 막으면 다른 테이블로 샌다.
- **SELECT 전용**: 약사용 INSERT/UPDATE/DELETE 정책은 만들지 않는다(최소권한).
- 기존 무효 `medications_pharmacist`(빈 pharmacy_patients 기준)는 **교체/삭제**.
- 노출 필드 최소화: 정책으로 행 접근을 막되, 추가로 뷰/쿼리에서 불필요 컬럼(주민번호·연락처)을 제외.

## 2. 누수 테스트 (음성이 핵심)

약사 **사용자 토큰**(anon key + 약사 세션)으로 실제 SELECT를 실행해 검증한다. service_role로 테스트하면 RLS를 우회하므로 **반드시 약사 사용자 토큰**으로.

시드: 약사 A(약국 X owner), 약사 B(약국 Y owner), 환자 P1(단골=X, 동의 O), P2(단골=X, 동의 X), P3(단골=Y, 동의 O), P4(단골=X, 동의했다가 철회).

검증 매트릭스 — 약사 A 토큰으로:
| 대상 | user_medications SELECT 기대 |
|---|---|
| P1 (단골 X · 동의 O) | **보임(>0)** — 양성 |
| P2 (단골 X · 미동의) | **0건** — 음성 |
| P3 (단골 Y · 동의 O) | **0건** — 음성(타약국) |
| P4 (동의 철회) | **0건** — 음성(철회 즉시반영) |
- `user_prescriptions`·`profiles`에도 동일 매트릭스 반복.
- 약사 A가 P2/P3/P4를 1건이라도 읽으면 → **차단(blocker)**.

테스트 스크립트 골격(`scripts/test-pharmacy-rls.mjs` 형태로 번들):
```js
// 약사 사용자 토큰으로 클라이언트 생성 (service_role 아님)
const sb = createClient(URL, ANON_KEY)
await sb.auth.signInWithPassword({ email: PHARMACIST_A, password })  // 또는 세션 주입
for (const [label, patientId, expectVisible] of cases) {
  const { data } = await sb.from('user_medications').select('id').eq('user_id', patientId)
  const ok = expectVisible ? (data?.length > 0) : (data?.length === 0 || data == null)
  console.log(ok ? 'PASS' : 'FAIL', label)
}
```

## 3. service_role 우회 탐지

대시보드 조회 경로가 `createAdminClient()`(service_role)를 쓰면 RLS를 무력화한다 → 누수 위험.
```
Grep "createAdminClient" (src/app/pharmacy, 약사 조회 API)
```
- 약사 데이터 조회는 **사용자 토큰 기반 server client**(`@/lib/supabase/server`)여야 한다. admin client는 금지(쓰기 동기화 등 RLS 무관 작업에만 한정).

## 4. 보고 (`_workspace/pharmacy/0X_security_audit.md`)

| 영역 | 케이스 | 기대 | 실제 | 상태 |
|---|---|---|---|---|
- 음성 테스트 FAIL = **차단**. service_role 우회 = 차단. 과다권한(약사 쓰기 정책 존재) = 차단.
- 양성 테스트 FAIL(동의 환자가 안 보임) = 기능 결함(경고~차단).
- 결함은 backend-engineer/tech-architect에 SendMessage(파일:라인 + 재현 쿼리).

## 흔한 함정

- service_role로 누수 테스트 → 항상 PASS처럼 보임(RLS 우회). 반드시 약사 **사용자 토큰**.
- 관계(단골)만 확인하고 동의 게이트 누락 → 미동의 노출.
- user_medications만 막고 user_prescriptions/profiles는 안 막음 → 옆문 누수.
- 동의 철회를 세션/캐시에 의존 → 철회 미반영. 매 쿼리 RLS 재평가로.
