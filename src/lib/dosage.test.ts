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
