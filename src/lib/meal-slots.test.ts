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
