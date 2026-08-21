import { test } from 'node:test'
import assert from 'node:assert/strict'
import { doseSummary, weekdayLabels, isScheduledOnWeekday } from './med-schedule.ts'

// doseSummary — 의사·약사에게 보여주는 한 줄 요약.
// 여기서 틀리면 임상 판단이 달라지므로, 복용 방식이 문구에 반드시 드러나야 한다.

test('필요시(prn) 약은 "하루 N회"로 표기하지 않는다', () => {
  // 회귀: 전달 화면이 schedule_type 을 조회하지 않아 PRN 이 "하루 1회"로 나갔다.
  const s = doseSummary({ schedule_type: 'prn', doses_per_day: 1, dose_amount: 1 })
  assert.ok(!s.includes('하루'), `"하루"가 남아 있다: ${s}`)
  assert.ok(s.includes('필요시'), `"필요시"가 없다: ${s}`)
})

test('필요시 약은 doses_per_day 가 없어도 "필요시"라고 말한다', () => {
  // 회귀: doses_per_day 가 빈 PRN 은 아무 표기도 없어, 같은 PRN 두 개가 다르게 보였다.
  assert.equal(doseSummary({ schedule_type: 'prn' }), '필요시')
})

test('매일 약은 기존 표기를 유지한다', () => {
  assert.equal(doseSummary({ schedule_type: 'daily', dose_amount: 1, doses_per_day: 2 }), '1회 1 · 하루 2회')
})

test('schedule_type 이 없으면 매일로 본다(기존 데이터 호환)', () => {
  assert.equal(doseSummary({ dose_amount: 1, doses_per_day: 2 }), '1회 1 · 하루 2회')
})

test('매주 약은 요일을 밝힌다', () => {
  assert.equal(
    doseSummary({ schedule_type: 'weekly', dow: [1, 4], dose_amount: 1, doses_per_day: 2 }),
    '1회 1 · 매주 월·목 · 하루 2회',
  )
})

test('매주인데 요일이 비면 "매주"로만 표기한다', () => {
  assert.equal(doseSummary({ schedule_type: 'weekly', dow: [] }), '매주')
})

test('아무 정보도 없으면 빈 문자열 — 없는 사실을 지어내지 않는다', () => {
  assert.equal(doseSummary({}), '')
})

test('용량만 있으면 용량만 표기한다', () => {
  assert.equal(doseSummary({ dose_amount: 2 }), '1회 2')
})

// 기존 헬퍼 회귀 방어 (지금까지 테스트가 없었다)
test('weekdayLabels 는 요일을 정렬해 이어 붙인다', () => {
  assert.equal(weekdayLabels([4, 1]), '월·목')
  assert.equal(weekdayLabels([]), '')
  assert.equal(weekdayLabels(null), '')
})

test('isScheduledOnWeekday — prn 은 어떤 요일에도 일정에 없다', () => {
  assert.equal(isScheduledOnWeekday({ schedule_type: 'prn' }, 1), false)
  assert.equal(isScheduledOnWeekday({ schedule_type: 'weekly', dow: [1] }, 1), true)
  assert.equal(isScheduledOnWeekday({ schedule_type: 'weekly', dow: [1] }, 2), false)
  assert.equal(isScheduledOnWeekday({}, 3), true)
})
