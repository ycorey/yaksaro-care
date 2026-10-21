import { test } from 'node:test'
import assert from 'node:assert/strict'
import { canReceiveHealthPush } from './push-eligibility.ts'

test('동의 + 알림 켬 → 발송', () => {
  assert.equal(canReceiveHealthPush({ consent_health: true, alarm_enabled: true }), true)
})

test('동의 + 알림 미설정(null) → 발송 — 알림은 기본 켜짐', () => {
  assert.equal(canReceiveHealthPush({ consent_health: true, alarm_enabled: null }), true)
})

test('미동의 → 알림을 켜 둬도 발송하지 않는다', () => {
  assert.equal(canReceiveHealthPush({ consent_health: false, alarm_enabled: true }), false)
})

test('동의 값 null·누락 → 동의로 읽지 않는다', () => {
  assert.equal(canReceiveHealthPush({ consent_health: null, alarm_enabled: true }), false)
  assert.equal(canReceiveHealthPush({ alarm_enabled: true }), false)
})

test('동의 + 알림 끔 → 발송하지 않는다', () => {
  assert.equal(canReceiveHealthPush({ consent_health: true, alarm_enabled: false }), false)
})
