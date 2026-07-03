# 약사 환자 복약 기록 요약 (순응 추세) 설계

- **날짜**: 2026-07-03
- **상태**: 승인됨 (스펙 리뷰 대기)
- **대상**: `medication_check_logs`(마이그레이션 044 RLS) · `lib/adherence.ts`(신규) · `@share/default.tsx`(리팩터) · `pharmacy/(app)/patients/[id]/page.tsx`(섹션 추가)

## 배경 / 문제

약사 대시보드는 단골 환자의 **현재 복약 목록**(약 N종)만 보여준다. 환자가 약을 실제로
꾸준히 챙기는지(순응 추세)는 알 수 없다. B2B 유료 전환 가치가 있는 정보인데 빠져 있다.

환자용 리포트(`/share`)는 이미 `medication_check_logs` 기반 **기록 기준** 순응 요약을 만든다
(기록한 날·총 체크·하루 평균 + 히트맵, "미기록≠미복약"). 하지만 그 계산은 `@share/default.tsx`에
**인라인**이고, 약사는 `medication_check_logs`를 **읽을 RLS 권한이 없다**(007은 본인 select/insert만;
014/031은 user_medications·prescriptions·members에만 약사 정책 부여).

## 목표

환자 상세 페이지(`/pharmacy/patients/[id]`)에 **"최근 복약 기록"(14일)** 섹션을 추가해, 약사가
환자의 복약 기록 추세를 read-only로 본다. 프레이밍은 앱의 기존 리포트와 동일한 **기록 기준**
(순응률 % 아님, "미기록≠미복약")으로 규제 안전성을 유지한다.

## 결정 사항 (브레인스토밍)

- **배치**: 환자 상세 페이지의 "최근 복약 기록" 섹션. (목록 카드 신호는 이번 제외)
- **기간**: 최근 **14일**.
- **프레이밍**: **기록 기준**(기록한 날·총 체크·하루 평균 + 히트맵). 순응률 % 아님.
- **보안**: 약사 토큰 + RLS로만 조회. **service_role 우회 금지**(약사모드 핵심 계율).

## 설계 (A안)

### 1) 데이터 / 보안 — 마이그레이션 044

`medication_check_logs`에 약사 SELECT 정책 신규. 031의 user_medications 정책과 **동일 게이트**
(`pharmacist_can_view` 동의 AND `is_self_member` 본인 멤버 — 가족 멤버 로그 제외). 기존 함수 재사용.

```sql
drop policy if exists "mcl_pharmacist_view" on public.medication_check_logs;
create policy "mcl_pharmacist_view" on public.medication_check_logs
  for select using (
    public.pharmacist_can_view(user_id)
    and public.is_self_member(member_id)
  );
```

- 기존 `med_check_logs_select`(본인)·`med_check_logs_insert`는 그대로 유지 — 추가만 한다.
- `member_id`가 null(030 이전 레거시, is_self_member=false)이면 제외 — 앱 필터와 정합.
- 약사는 자기 토큰으로 조회(우회 0). 동의 철회·타약국·가족 멤버 로그는 RLS가 비운다.

### 2) 계산 헬퍼 — `lib/adherence.ts` (신규)

`@share/default.tsx`의 인라인 순응 계산을 순수 함수로 추출해 **약사·환자 리포트가 공유**한다(DRY).

```ts
export type AdherenceSummary = {
  periodDays:   number
  recordedDays: number
  checkedSlots: number
  perDay:       { date: string; done: number }[]
}
// append-only 로그 → (날짜,끼니)별 최신 상태 압축 → 일별 done 집계.
// logs는 logged_at 오름차순 정렬 전제. check_date는 UTC 규약(캘린더/리포트와 동일).
export function summarizeAdherence(
  logs: { check_date: string; meal_time: string; is_checked: boolean }[],
  periodDays: number,
  nowMs: number,
): AdherenceSummary
```

- `AdherenceSummary` 타입을 `report-view.tsx`에서 이 파일로 이동(리포트는 여기서 import).
- `@share/default.tsx`는 인라인 로직(현 59~99행)을 `summarizeAdherence(logs, 30, nowMs)` 호출로 교체 — **동작 불변**(30일 유지). 로그 조회·`applyMemberScope`는 그대로.
- 끼니 유효성은 `isMeal`(bedtime 포함)로 판정 → done 0~4.

### 3) 상세 페이지 섹션 — `pharmacy/(app)/patients/[id]/page.tsx`

기존에 조회하는 `selfMemberId`(본인 멤버)를 활용해, 최근 14일 로그를 약사 토큰으로 조회:

```ts
// self 멤버가 있을 때만 (기존 meds 조회와 동일 가드)
const logs = selfMemberId ? (await supabase
  .from('medication_check_logs')
  .select('check_date, meal_time, is_checked, logged_at')
  .eq('user_id', id).eq('member_id', selfMemberId)
  .gte('check_date', <14일 전 UTC>).lte('check_date', <오늘 UTC>)
  .order('logged_at', { ascending: true })).data ?? [] : []
const adherence = summarizeAdherence(logs, 14, new Date().getTime())
```

- 신규 프레젠테이션 컴포넌트 `pharmacy-adherence-section.tsx`(서버 렌더, 무상호작용):
  "최근 14일 복약 기록" — 기록한 날(14일 중)·총 체크·하루 평균 + **14칸 히트맵** + **"앱에 직접 기록한 날 기준이에요. 기록하지 않은 날의 복약 여부는 포함되지 않아요."** 문구.
- 로그 0건 → "아직 복약 기록이 없어요" 빈 상태. self 멤버 없음 → 섹션 생략(기존 정합).
- 상세 페이지의 접근불가(RLS 비움) 분기는 기존 그대로.

### 4) 데이터 흐름

```
약사 상세 진입 → (RLS: pharmacist_can_view AND is_self_member)
  self 멤버 14일 medication_check_logs 조회(약사 토큰)
  → summarizeAdherence(logs,14,now) → 섹션 렌더(기록기준·read-only)
미동의/철회/타약국/가족멤버 → RLS가 로그 0건 → "기록 없어요"(정보 노출 0)
```

### 5) 엣지 케이스

- self 멤버 없음 → 섹션 미표시(기존 `selfMemberId` null 가드 재사용).
- 로그 0건 → 빈 상태 문구.
- `check_date`는 UTC 저장 규약 → 기간 경계도 UTC로 계산(share와 동일).
- 레거시 null member_id 로그 → RLS·앱 필터 모두 제외(자기 self 멤버 것만).

## 테스트

- **단위(`summarizeAdherence`)**: append-only 압축(같은 날·끼니 재체크→최신), 일별 done, recordedDays/checkedSlots, 빈 로그, 기간 경계. Node 내장 러너 무의존성.
- **보안 e2e**: 약사=동의 환자 self 로그 **읽힘** / 미동의(철회)·타약국·가족(비-self) 멤버 로그 **안 읽힘**. 임시데이터 생성·정리(qr-flow-sim 패턴).
- `@share` 리포트 회귀: 리팩터 후 30일 요약 동작 불변(tsc/lint/build + 스모크).
- `tsc`/`lint`/`build`.

## 비목표 (이번 제외)

- 환자 **목록 카드** 순응 신호(집계 쿼리 비용 — 추후)
- 순응률 %(분모) — 기록 기준 유지
- 지연/미복약 **알림**, 실시간 갱신
- `medication_schedules`(현재상태) 기반 계산 — 이력은 check_logs가 정본

## 롤아웃

- 마이그레이션 044 **운영 DB 적용 필요**(약사 SELECT 정책). 앱 코드는 정책 존재 전제(정책 없으면 약사 조회가 0건 → 섹션 빈 상태로 안전 degrade, 누수는 없음).
- 나머지 코드는 main 머지 시 적용. 신규 런타임 의존성 0.
