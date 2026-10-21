import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isMeal, defaultMealKeys, effectiveMealSlots } from './meal-slots.ts'

test('isMeal: 유효 끼니만 true', () => {
  for (const m of ['morning', 'afternoon', 'evening', 'bedtime']) assert.equal(isMeal(m), true)
  for (const x of ['lunch', '', null, undefined, 3, 'MORNING']) assert.equal(isMeal(x), false)
})

test('defaultMealKeys: 복용횟수 폴백 규칙', () => {
  assert.deepEqual(defaultMealKeys(1), ['morning'])
  assert.deepEqual(defaultMealKeys(2), ['morning', 'evening'])
  assert.deepEqual(defaultMealKeys(3), ['morning', 'afternoon', 'evening'])
  assert.deepEqual(defaultMealKeys(4), ['morning', 'afternoon', 'evening']) // 3회 이상은 3끼
  assert.deepEqual(defaultMealKeys(0), ['morning', 'afternoon', 'evening']) // 방어적 기본
})

test('effectiveMealSlots: meal_times 있으면 유효값만 사용', () => {
  assert.deepEqual(
    effectiveMealSlots({ meal_times: ['morning', 'bedtime'], doses_per_day: 2 }),
    ['morning', 'bedtime'],
  )
})
test('effectiveMealSlots: meal_times의 잘못된 값은 걸러짐', () => {
  assert.deepEqual(
    effectiveMealSlots({ meal_times: ['morning', 'lunch', 'evening'], doses_per_day: 2 }),
    ['morning', 'evening'],
  )
})
test('effectiveMealSlots: meal_times 없으면 복용횟수 폴백', () => {
  assert.deepEqual(effectiveMealSlots({ meal_times: [], doses_per_day: 2 }), ['morning', 'evening'])
  assert.deepEqual(effectiveMealSlots({ meal_times: null, doses_per_day: 1 }), ['morning'])
  assert.deepEqual(effectiveMealSlots({}), ['morning', 'afternoon', 'evening']) // doses 없음 → 0 → 기본
})

// ── 등록 당일 복용 시작 규칙 ──────────────────────────────────────────

import { slotsApplicableToday } from './meal-slots.ts'

// KST 로컬시각 → ISO(UTC) 문자열 (테스트 가독성용: '2026-08-21', '19:30' → UTC ISO)
function kstIso(date: string, time: string): string {
  return new Date(`${date}T${time}:00+09:00`).toISOString()
}

const ALL: ReturnType<typeof slotsApplicableToday> = ['morning', 'afternoon', 'evening', 'bedtime']
const TODAY = '2026-08-21'

test('등록 당일이 아니면 전 슬롯 적용 (어제 등록·내일 조회)', () => {
  assert.deepEqual(slotsApplicableToday(ALL, kstIso('2026-08-20', '19:30'), TODAY), ALL)
})

test('created_at 이 없으면 전 슬롯 적용 (과거 데이터 방어)', () => {
  assert.deepEqual(slotsApplicableToday(ALL, null, TODAY), ALL)
  assert.deepEqual(slotsApplicableToday(ALL, undefined, TODAY), ALL)
})

test('저녁(19:30) 등록 → 저녁·자기 전만 (사용자 시나리오: 1일 3회를 저녁부터)', () => {
  assert.deepEqual(
    slotsApplicableToday(ALL, kstIso(TODAY, '19:30'), TODAY),
    ['evening', 'bedtime'])
})

test('아침 경계: 10:59 등록은 아침 포함, 11:00 등록은 제외(점심부터)', () => {
  assert.deepEqual(
    slotsApplicableToday(ALL, kstIso(TODAY, '10:59'), TODAY), ALL)
  assert.deepEqual(
    slotsApplicableToday(ALL, kstIso(TODAY, '11:00'), TODAY),
    ['afternoon', 'evening', 'bedtime'])
})

test('점심 경계: 15:29 포함 / 15:30 제외 — 18:30 등록에 점심+저녁 이중복용이 생기지 않는다', () => {
  assert.deepEqual(
    slotsApplicableToday(ALL, kstIso(TODAY, '15:29'), TODAY),
    ['afternoon', 'evening', 'bedtime'])
  assert.deepEqual(
    slotsApplicableToday(ALL, kstIso(TODAY, '18:30'), TODAY),
    ['evening', 'bedtime'])
})

test('저녁 경계: 21:59 포함(20시에 받은 저녁약은 오늘) / 22:00 제외(자기 전부터)', () => {
  assert.deepEqual(
    slotsApplicableToday(ALL, kstIso(TODAY, '21:59'), TODAY),
    ['evening', 'bedtime'])
  assert.deepEqual(
    slotsApplicableToday(ALL, kstIso(TODAY, '22:00'), TODAY),
    ['bedtime'])
})

test('자기 전은 자정까지 — 23:59 등록도 자기 전 약은 오늘 먹는다', () => {
  assert.deepEqual(
    slotsApplicableToday(ALL, kstIso(TODAY, '23:59'), TODAY),
    ['bedtime'])
})

// ── 날짜 키 규약: "당일" 은 화면·check_date 와 같은 **한국 날짜**로 판정한다(kst-date.ts).
// 2026-10-20 전에는 UTC 날짜였다(하루가 KST 09:00 에 넘어감) — 아침 8시 체크가 전날 행에 남던 원인.
// 교훈은 유지: 여기만 다른 규약이면 하루가 바뀌는 시각에 필터가 화면보다 먼저 풀려 끼니가 부활한다.

test('KST 23:30 등록(UTC 14:30) → 아직 8/21 — 당일 규칙 적용, 자기 전만', () => {
  assert.deepEqual(
    slotsApplicableToday(ALL, '2026-08-21T14:30:00Z', TODAY),
    ['bedtime'])
})

test('KST 자정이 하루 경계다: 8/22 00:30(UTC 8/21 15:30) 등록은 8/21 화면에서 "오늘 등록" 이 아니다', () => {
  // 저녁 19:30 등록 → 8/21 화면에서는 저녁·자기 전만
  assert.deepEqual(
    slotsApplicableToday(ALL, kstIso(TODAY, '19:30'), TODAY),
    ['evening', 'bedtime'])
  // KST 8/22 00:30 = UTC 8/21 15:30 — UTC 규약이던 때는 "같은 하루" 였지만 이제 8/22 다 → 전 슬롯
  assert.deepEqual(
    slotsApplicableToday(ALL, '2026-08-21T15:30:00Z', TODAY), ALL)
  // 그 등록을 8/22 화면에서 보면 당일 — 00:30 은 모든 마감보다 이르므로 전 슬롯
  assert.deepEqual(
    slotsApplicableToday(ALL, '2026-08-21T15:30:00Z', '2026-08-22'), ALL)
})

test('아침 8시(UTC 전날 23시) 등록은 한국 오늘의 등록이다 — 평가가 지목한 구간', () => {
  // 8/21 08:00 KST = 8/20 23:00Z. UTC 규약이면 "어제 등록" 으로 읽혀 전 슬롯이 그대로 적용됐다.
  // KST 규약에서는 당일 등록이고 08:00 은 아침 마감(≤ 11:00) 전이므로 역시 전 슬롯 — 결과는 같지만
  // 판정 근거가 다르다. 10:59 → 전 슬롯, 11:00 → 아침 제외로 당일 규칙이 실제로 걸리는지 본다.
  assert.deepEqual(slotsApplicableToday(ALL, '2026-08-21T01:59:00Z', TODAY), ALL)
  assert.deepEqual(slotsApplicableToday(ALL, '2026-08-21T02:00:00Z', TODAY), ['afternoon', 'evening', 'bedtime'])
})

test('화면-하루가 넘어가면(한국 날짜 변경) 전 슬롯 복귀', () => {
  assert.deepEqual(
    slotsApplicableToday(ALL, kstIso(TODAY, '19:30'), '2026-08-22'), ALL)
})

test('약이 가진 슬롯만 거른다 — 아침·저녁 약을 저녁에 등록하면 저녁만', () => {
  assert.deepEqual(
    slotsApplicableToday(['morning', 'evening'], kstIso(TODAY, '19:30'), TODAY),
    ['evening'])
})

test('전부 지나간 시각(자기 전 없는 약을 22시 이후 등록) → 오늘은 빈 배열(내일 아침부터)', () => {
  assert.deepEqual(
    slotsApplicableToday(['morning', 'afternoon', 'evening'], kstIso(TODAY, '22:30'), TODAY),
    [])
})
