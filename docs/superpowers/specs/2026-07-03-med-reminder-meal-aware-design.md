# 복약 알림을 실제 등록 약의 끼니에 맞추기 — 설계

- **날짜**: 2026-07-03
- **상태**: 승인됨 (구현 계획 대기)
- **대상**: `api/cron/medication-reminders`, `lib/meal-slots.ts`

## 배경 / 문제

Vercel 크론이 하루 4번 고정 시각(아침 08:00·점심 12:30·저녁 19:00·자기전 22:00 KST)에
끼니별로 호출되어 푸시 리마인더를 보낸다. 현재 전송 조건은:

1. 푸시 구독 있음
2. 알림 설정 켬 (`profiles.alarm_enabled` + `alarm_times[meal]`)
3. **활성 복약이 하루 한 알이라도 있음** (PRN·오늘 요일 아닌 weekly는 제외)
4. 이 끼니 아직 미체크

**문제**: 3번이 "약이 하나라도 있으면"이라, 그 약을 **실제로 이 끼니에 먹는지(`meal_times`)를
보지 않는다.** 아침·저녁만 먹는 사용자도 점심·자기전 토글이 켜져 있으면 알림을 받는다.

반면 홈/오늘 탭은 이미 `meal_times`(없으면 복용횟수 기반 `defaultMealKeys`)로 "약 있는 끼니"만
정확히 계산한다. **크론만 이 규칙을 따르지 않아 화면과 알림이 어긋난다.**

## 목표

복약 알림을 **약이 실제로 있는 끼니에만** 보낸다. 판정 규칙은 홈/오늘 탭과 동일하게 통일해
"화면에 뜨는 끼니 = 알림 오는 끼니"가 일치하게 한다.

## 결정 사항 (브레인스토밍)

- **기준**: "약 있는 끼니에만 알림" — 등록 약의 `meal_times`(없으면 `defaultMealKeys(복용횟수)`)에
  이 끼니가 포함될 때만.
- **기존 끼니별 토글**: 유지하고 **오버라이드**로 동작. 즉 알림 = (약 있는 끼니) AND (토글 켬).
  약이 있어도 특정 끼니를 끄고 싶으면 사용자가 끌 수 있다.

## 설계 (A안 — 크론에 끼니 매칭 필터 추가)

### 동작 규칙

`meal` 끼니 크론에서 푸시 대상 = 아래를 **모두** 만족하는 (사용자, 멤버) 쌍:

1. 푸시 구독 있음
2. `alarm_enabled ≠ false` **AND** `alarm_times[meal] ≠ false`
3. **이 끼니에 실제 약 있음**: 활성 약(`deleted_at`·`ended_at` null, PRN 제외, weekly는 오늘 요일만)
   중 `effectiveMealSlots(약)`에 `meal`이 포함된 약이 1개 이상
4. 이 끼니를 아직 체크하지 않음

### 변경 지점 (딱 2곳)

**1) `lib/meal-slots.ts` — `effectiveMealSlots(med)` 헬퍼 신규 (SSOT)**

```ts
// 이 약이 실제로 배정되는 끼니. meal_times 우선, 없으면 복용횟수 기반 폴백.
// 홈/오늘/크론이 동일 규칙을 공유하도록 단일화한다.
export function effectiveMealSlots(
  med: { meal_times?: string[] | null; doses_per_day?: number | null }
): Meal[] {
  const mt = (med.meal_times ?? []).filter(isMeal)
  return mt.length > 0 ? mt : defaultMealKeys(med.doses_per_day ?? 0)
}
```

**2) `api/cron/medication-reminders/route.ts` — 활성 약 쿼리·집계 수정**

- 활성 약 조회 `select`에 `meal_times, doses_per_day` 추가.
- `activeMembersByUser` 집계 시, 기존 "약 존재" 조건에 더해
  **`effectiveMealSlots(med).includes(meal)`** 를 만족하는 약만 해당 (user, member)를 추가.
- 나머지 로직(체크 여부 비교·전송·만료 처리·인증)은 그대로.

### 데이터 흐름

```
크론(meal) → 활성 약 조회(meal_times·doses_per_day 포함)
  → 각 약 effectiveMealSlots에 meal 포함? → 포함 약이 있는 (user,member)만 "이 끼니 활성"
  → 알림 토글(2) AND 미체크(4) 교집합 → sendPushToUser
```

### 엣지 케이스

- `meal_times` 비어있는 약(수동/코드 입력) → `defaultMealKeys(doses_per_day ?? 0)` 폴백
  (홈/오늘과 동일 규칙이라 화면-알림 일치).
- `doses_per_day`도 없음 → `defaultMealKeys(0)` = 아침·점심·저녁 (기존 화면 규칙과 동일).
- PRN · 오늘 요일 아닌 weekly → 지금처럼 제외.
- 이 끼니에 약이 하나도 없는 사용자 → 그 끼니 알림 안 감(의도된 동작).

### 변경하지 않는 것 (비목표)

- DB 스키마 (컬럼·마이그레이션 없음)
- 설정 화면 UI, 끼니 토글 구조
- 크론 스케줄 시각, 알림 문구
- 약별 개별 시각 지정(C안), DB 사전계산(B안) — 스코프 밖

### 선택(Optional, 별도 판단)

- 설정 화면에 "약이 있는 끼니에만 알림이 가요" 안내 한 줄 추가. 기능엔 영향 없음.
- 홈/오늘의 인라인 슬롯 계산도 `effectiveMealSlots`로 교체해 중복 제거(일관성 리팩터). 안전하면 포함.

## 테스트

- **단위**: `effectiveMealSlots`
  - `meal_times=['morning','evening']` → `['morning','evening']`
  - `meal_times=[]`, `doses_per_day=1` → `['morning']`
  - `meal_times=[]`, `doses_per_day=2` → `['morning','evening']`
  - `meal_times=[]`, `doses_per_day=null` → `['morning','afternoon','evening']`
  - `meal_times`에 잘못된 값 섞임 → 유효 Meal만 남김
- **크론 시나리오**(순수 함수 추출 또는 e2e 시드):
  - 약 아침·저녁만인 유저 → `morning`/`evening` 크론에만 대상, `afternoon`/`bedtime` 제외
  - 토글로 `evening` 끔 → 약 있어도 저녁 알림 제외
  - 해당 끼니 이미 체크 → 제외
  - PRN만 있는 유저 → 모든 끼니 제외

## 롤아웃

- 코드 변경만(스키마 없음) → main 머지 시 즉시 적용.
- Vercel `CRON_SECRET` 등 기존 크론 env는 그대로. 크론 스케줄 변경 없음.
