import { test } from 'node:test'
import assert from 'node:assert/strict'
import { kstDateOf, addDays, daysBetween } from './kst-date.ts'

test('KST 00~09시는 UTC 로는 전날 — 한국 날짜를 돌려준다 (평가가 지목한 바로 그 구간)', () => {
  // 2026-08-21 08:00 KST = 2026-08-20 23:00Z
  assert.equal(kstDateOf('2026-08-20T23:00:00Z'), '2026-08-21')
  assert.equal(kstDateOf('2026-08-21T00:00:00+09:00'), '2026-08-21')
  assert.equal(kstDateOf('2026-08-20T14:59:59Z'), '2026-08-20')   // KST 23:59:59
  assert.equal(kstDateOf('2026-08-20T15:00:00Z'), '2026-08-21')   // KST 00:00:00
})

test('입력 형태 셋(ISO 문자열 · epoch ms · Date) 모두 같은 답', () => {
  const iso = '2026-08-20T23:30:00Z'
  const ms = Date.parse(iso)
  assert.equal(kstDateOf(iso), '2026-08-21')
  assert.equal(kstDateOf(ms), '2026-08-21')
  assert.equal(kstDateOf(new Date(ms)), '2026-08-21')
})

test('addDays / daysBetween 은 월말·연말을 넘긴다', () => {
  assert.equal(addDays('2026-08-31', 1), '2026-09-01')
  assert.equal(addDays('2026-12-31', 1), '2027-01-01')
  assert.equal(addDays('2026-03-01', -1), '2026-02-28')
  assert.equal(daysBetween('2026-08-21', '2026-08-21'), 0)
  assert.equal(daysBetween('2026-08-21', '2026-08-22'), 1)
  assert.equal(daysBetween('2026-08-22', '2026-08-21'), -1)
  assert.equal(daysBetween('2026-08-21', '2026-09-20'), 30)
})
