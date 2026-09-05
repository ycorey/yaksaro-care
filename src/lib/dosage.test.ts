import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildDosage, buildDoctorDosage } from './dosage.ts'

// 회귀: 스토어 스크린샷 촬영 중 "1회 1 · 1일 1회 · 30일분" 이 발견됐다(2026-09-05).
// 숫자 뒤 단위가 통째로 빠져 문장이 끊긴 것처럼 읽힌다. 세 화면에 같은 코드가 복제돼 있었다.
test('1회 투약량에는 단위가 붙는다', () => {
  assert.equal(buildDosage(1, 1, 30), '1회 1정 · 1일 1회 · 30일분')
  assert.equal(buildDoctorDosage(1, 1), '1회 1정 · 하루 1회')
})

test('반 알 입력(0.5)도 단위가 붙는다', () => {
  // 입력 스테퍼가 step 0.5 라 실제로 들어올 수 있는 값이다
  assert.equal(buildDosage(0.5, 2, null), '1회 0.5정 · 1일 2회')
})

test('없는 항목은 구분점째로 빠진다', () => {
  assert.equal(buildDosage(null, 2, 30), '1일 2회 · 30일분')
  assert.equal(buildDosage(null, null, 30), '30일분')
  assert.equal(buildDosage(null, null, null), '')
  assert.equal(buildDoctorDosage(null, null), '')
})

test('0 은 값이 없는 것으로 다룬다 — "1회 0정" 을 만들지 않는다', () => {
  assert.equal(buildDosage(0, 0, 0), '')
})

// 회귀: 문구 QA(2026-09-05)에서 필요시 약(자누비아·타이레놀)이 약 지갑·약사 환자 상세에
// "1일 1회" 로, 의사 제시 화면에 "하루 1회" 로 나갔다. doses_per_day 잔여값을 방식과 무관하게 찍었다.
test('필요시(PRN) 약은 1일 N회 를 찍지 않는다', () => {
  assert.equal(buildDosage(1, 1, 30, { scheduleType: 'prn' }), '1회 1정 · 30일분')
  assert.equal(buildDosage(null, 1, null, { scheduleType: 'prn' }), '')
  assert.equal(buildDoctorDosage(1, 1, { scheduleType: 'prn' }), '1회 1정 · 필요시')
  assert.equal(buildDoctorDosage(null, 1, { scheduleType: 'prn' }), '필요시')
})

test('의사 제시: 매주 약은 요일이 문장 안에 들어간다(배지가 없는 화면)', () => {
  assert.equal(buildDoctorDosage(1, 1, { scheduleType: 'weekly', scheduleLabel: '매주 월·목' }), '1회 1정 · 매주 월·목 · 하루 1회')
})

test('방식을 안 넘기면 매일로 본다(기존 호출 호환)', () => {
  assert.equal(buildDosage(1, 2, 30), '1회 1정 · 1일 2회 · 30일분')
  assert.equal(buildDoctorDosage(1, 2), '1회 1정 · 하루 2회')
})
