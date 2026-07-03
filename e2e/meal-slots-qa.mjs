// 복약 알림 끼니 규칙(effectiveMealSlots) 단위 테스트 — Node 내장 러너, 무의존성.
// 실행: node --experimental-strip-types --test e2e/meal-slots-qa.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { effectiveMealSlots } from '../src/lib/meal-slots.ts'

test('meal_times 지정 → 그대로(유효 Meal만)', () => {
  assert.deepEqual(effectiveMealSlots({ meal_times: ['morning', 'evening'] }), ['morning', 'evening'])
})
test('meal_times 빈값 + 1회 → 아침', () => {
  assert.deepEqual(effectiveMealSlots({ meal_times: [], doses_per_day: 1 }), ['morning'])
})
test('meal_times 빈값 + 2회 → 아침·저녁', () => {
  assert.deepEqual(effectiveMealSlots({ meal_times: [], doses_per_day: 2 }), ['morning', 'evening'])
})
test('meal_times 빈값 + 3회 → 아침·점심·저녁', () => {
  assert.deepEqual(effectiveMealSlots({ meal_times: [], doses_per_day: 3 }), ['morning', 'afternoon', 'evening'])
})
test('meal_times·doses 모두 없음 → 아침·점심·저녁(폴백 0)', () => {
  assert.deepEqual(effectiveMealSlots({}), ['morning', 'afternoon', 'evening'])
})
test('meal_times에 잘못된 값 섞임 → 유효 Meal만', () => {
  assert.deepEqual(effectiveMealSlots({ meal_times: ['morning', 'brunch', 'bedtime'] }), ['morning', 'bedtime'])
})
test('시나리오: 아침·저녁 약 → 점심/자기전은 알림 대상 아님', () => {
  const slots = effectiveMealSlots({ meal_times: ['morning', 'evening'] })
  assert.equal(slots.includes('afternoon'), false)
  assert.equal(slots.includes('bedtime'), false)
  assert.equal(slots.includes('morning'), true)
  assert.equal(slots.includes('evening'), true)
})
