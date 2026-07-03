// 복약 기록 요약(summarizeAdherence) 단위 테스트 — Node 내장 러너, 무의존성.
// 실행: node --experimental-strip-types --test e2e/adherence-qa.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { summarizeAdherence, VALID_MEALS } from '../src/lib/adherence.ts'
import { ALL_MEALS } from '../src/lib/meal-slots.ts'

// 기준 nowMs = 2026-07-14T00:00:00Z (UTC). periodDays=3 → 07-12,07-13,07-14
const NOW = Date.parse('2026-07-14T00:00:00Z')

test('빈 로그 → 전부 0', () => {
  const r = summarizeAdherence([], 3, NOW)
  assert.equal(r.periodDays, 3)
  assert.equal(r.recordedDays, 0)
  assert.equal(r.checkedSlots, 0)
  assert.deepEqual(r.perDay.map(d => d.done), [0, 0, 0])
  assert.deepEqual(r.perDay.map(d => d.date), ['2026-07-12', '2026-07-13', '2026-07-14'])
})

test('하루 2끼 체크 → done=2, recordedDays=1', () => {
  const logs = [
    { check_date: '2026-07-14', meal_time: 'morning', is_checked: true },
    { check_date: '2026-07-14', meal_time: 'evening', is_checked: true },
  ]
  const r = summarizeAdherence(logs, 3, NOW)
  assert.equal(r.recordedDays, 1)
  assert.equal(r.checkedSlots, 2)
  assert.equal(r.perDay.find(d => d.date === '2026-07-14').done, 2)
})

test('append-only: 같은 날·끼니 재체크는 최신 상태로 압축(체크→해제=0)', () => {
  const logs = [
    { check_date: '2026-07-13', meal_time: 'morning', is_checked: true },
    { check_date: '2026-07-13', meal_time: 'morning', is_checked: false },  // 나중 행=최신
  ]
  const r = summarizeAdherence(logs, 3, NOW)
  assert.equal(r.perDay.find(d => d.date === '2026-07-13').done, 0)
  assert.equal(r.recordedDays, 0)
})

test('잘못된 meal_time은 무시, bedtime은 유효(최대 4)', () => {
  const logs = ['morning', 'afternoon', 'evening', 'bedtime', 'brunch'].map(mt => ({
    check_date: '2026-07-12', meal_time: mt, is_checked: true,
  }))
  const r = summarizeAdherence(logs, 3, NOW)
  assert.equal(r.perDay.find(d => d.date === '2026-07-12').done, 4)
})

test('기간 밖 로그는 집계 제외', () => {
  const logs = [{ check_date: '2026-07-01', meal_time: 'morning', is_checked: true }]
  const r = summarizeAdherence(logs, 3, NOW)
  assert.equal(r.recordedDays, 0)
  assert.equal(r.perDay.length, 3)
})

test('VALID_MEALS는 meal-slots SSOT(ALL_MEALS)와 일치 — 드리프트 가드', () => {
  assert.deepEqual([...VALID_MEALS].sort(), [...ALL_MEALS].sort())
})
