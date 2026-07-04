// 약사 대시보드 파생 로직 단위 테스트 — Node 내장 러너, 무의존성.
// 실행: node --experimental-strip-types --test e2e/pharmacy-board-qa.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deriveTodayAutoTasks, buildCalendarItems, monthGridDays } from '../src/lib/pharmacy-board.ts'

const TODAY = '2026-07-15'

test('오늘 할 일: open+미답장 → reply_pending', () => {
  const t = deriveTodayAutoTasks({
    requests: [{ id: 'r1', patientId: 'u1', patientName: '김상우', status: 'open', due_date: '2026-07-20', replyText: null }],
    refillsToday: [], today: TODAY,
  })
  assert.equal(t.length, 1)
  assert.equal(t[0].kind, 'reply_pending')
  assert.equal(t[0].patientId, 'u1')
})

test('오늘 할 일: 답장했지만 오늘 마감 → due_today', () => {
  const t = deriveTodayAutoTasks({
    requests: [{ id: 'r2', patientId: 'u2', patientName: '이영희', status: 'acknowledged', due_date: TODAY, replyText: '오후 픽업' }],
    refillsToday: [], today: TODAY,
  })
  assert.equal(t.length, 1)
  assert.equal(t[0].kind, 'due_today')
})

test('오늘 할 일: 완료 요청은 제외', () => {
  const t = deriveTodayAutoTasks({
    requests: [{ id: 'r3', patientId: 'u3', patientName: '박', status: 'done', due_date: TODAY, replyText: null }],
    refillsToday: [], today: TODAY,
  })
  assert.equal(t.length, 0)
})

test('오늘 할 일: 오늘 리필 → refill_today', () => {
  const t = deriveTodayAutoTasks({
    requests: [], refillsToday: [{ patientId: 'u4', patientName: '최' }], today: TODAY,
  })
  assert.equal(t.length, 1)
  assert.equal(t[0].kind, 'refill_today')
  assert.equal(t[0].patientId, 'u4')
})

test('캘린더 항목: null 날짜 제외 + 날짜순 정렬 + kind 태깅', () => {
  const items = buildCalendarItems(
    [{ date: '2026-07-20', label: '김 전화요청' }, { date: null, label: '무마감' }],
    [{ date: '2026-07-18', label: '이 리필' }],
  )
  assert.equal(items.length, 2)
  assert.equal(items[0].date, '2026-07-18')
  assert.equal(items[0].kind, 'refill')
  assert.equal(items[1].kind, 'request')
})

test('월 그리드: 7일 배수 + 1일~말일 포함 + 첫 비어있지 않은 칸=1일', () => {
  const cells = monthGridDays('2026-07-15')
  assert.equal(cells.length % 7, 0)
  assert.equal(cells.filter(Boolean).length, 31)
  assert.equal(cells.find(Boolean), '2026-07-01')
  assert.ok(cells.includes('2026-07-31'))
})
