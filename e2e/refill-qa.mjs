// 리필 계산 단위 테스트 — Node 내장 러너, 무의존성.
// 실행: node --experimental-strip-types --test e2e/refill-qa.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeRefillSoon } from '../src/lib/refill.ts'

// 오늘 기준 만료 3일 뒤가 되도록 처방일 = 오늘-(28-3)=오늘-25일, 총 28일
function iso(offsetDays) {
  const d = new Date(); d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + offsetDays)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

test('만료 3일 전 처방 → 리필 대상 + expiryDate가 ISO(YYYY-MM-DD)', () => {
  const items = computeRefillSoon([
    { total_days: 28, custom_name: '혈압약', prescription: { id: 'p1', prescribed_at: iso(-25), duration_days: 28, hospital_name: '내과' } },
  ])
  assert.equal(items.length, 1)
  assert.match(items[0].expiryDate, /^\d{4}-\d{2}-\d{2}$/)
  assert.equal(items[0].expiryDate, iso(3))
  assert.equal(items[0].dDay, 3)
})

test('28일 미만 처방 → 대상 아님', () => {
  const items = computeRefillSoon([
    { total_days: 7, custom_name: '감기약', prescription: { id: 'p2', prescribed_at: iso(-5), duration_days: 7, hospital_name: '이비인후과' } },
  ])
  assert.equal(items.length, 0)
})
