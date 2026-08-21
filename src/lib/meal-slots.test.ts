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

// ── 날짜 키 규약: "당일" 은 화면·check_date 와 같은 UTC 날짜 문자열로 판정한다.
// (이 앱의 하루는 UTC 자정 = KST 09:00 에 넘어간다.) 여기만 KST 자정으로 키잉하면
// KST 00~09시에 필터가 화면-하루보다 먼저 풀려 제외했던 끼니가 부활한다(리뷰 실측).

test('KST 23:30 등록(UTC 14:30, 같은 UTC 날짜) → 당일 규칙 적용, 자기 전만', () => {
  assert.deepEqual(
    slotsApplicableToday(ALL, '2026-08-21T14:30:00Z', TODAY),
    ['bedtime'])
})

test('화면-하루 연속성: KST 다음날 00:30(UTC 15:30, 같은 UTC 날짜)에도 화면 day 가 같으면 당일로 판정', () => {
  // 저녁 19:30 등록 → KST 자정이 지나도 화면 day('2026-08-21')가 유지되는 동안은 필터 유지
  assert.deepEqual(
    slotsApplicableToday(ALL, kstIso(TODAY, '19:30'), TODAY),
    ['evening', 'bedtime'])
  // KST 8/22 00:30 = UTC 8/21 15:30 등록 — 같은 화면-하루. 등록 시각(KST 00:30)이 모든
  // 마감보다 이르므로 전 슬롯 적용(이제 막 시작하는 하루라는 판정과 일치)
  assert.deepEqual(
    slotsApplicableToday(ALL, '2026-08-21T15:30:00Z', TODAY), ALL)
})

test('화면-하루가 넘어가면(UTC 날짜 변경) 전 슬롯 복귀', () => {
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
