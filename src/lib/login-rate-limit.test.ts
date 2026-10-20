import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clientIpOf, loginAttemptKeys, LOGIN_LIMITS } from './login-rate-limit.ts'

const headers = (h: Record<string, string>) => (name: string) => h[name] ?? null

test('clientIpOf: x-forwarded-for 첫 항목이 클라이언트, 없으면 x-real-ip, 둘 다 없으면 unknown', () => {
  assert.equal(clientIpOf(headers({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1' })), '203.0.113.9')
  assert.equal(clientIpOf(headers({ 'x-forwarded-for': ' 203.0.113.9 ' })), '203.0.113.9')
  assert.equal(clientIpOf(headers({ 'x-real-ip': '198.51.100.3' })), '198.51.100.3')
  assert.equal(clientIpOf(headers({})), 'unknown')
  assert.equal(clientIpOf(headers({ 'x-forwarded-for': '' })), 'unknown')
})

test('loginAttemptKeys: 원문을 담지 않고, 이메일 대소문자·공백은 같은 키', () => {
  const a = loginAttemptKeys('203.0.113.9', 'Reviewer@Example.com ')
  const b = loginAttemptKeys('203.0.113.9', 'reviewer@example.com')
  assert.equal(a.ipEmail, b.ipEmail)
  assert.equal(a.ip, b.ip)
  assert.ok(!a.ipEmail.includes('example'), '이메일 원문이 키에 남으면 안 된다')
  assert.ok(!a.ipEmail.includes('203.0.113.9'), 'IP 원문이 키에 남으면 안 된다')
  assert.match(a.ipEmail, /^ipmail:[0-9a-f]{64}$/)
  assert.match(a.ip, /^ip:[0-9a-f]{64}$/)
})

test('loginAttemptKeys: IP 가 다르면 두 키가 다 다르고, 이메일만 다르면 IP 키는 같다', () => {
  const a = loginAttemptKeys('203.0.113.9', 'a@example.com')
  const b = loginAttemptKeys('203.0.113.10', 'a@example.com')
  const c = loginAttemptKeys('203.0.113.9', 'b@example.com')
  assert.notEqual(a.ipEmail, b.ipEmail)
  assert.notEqual(a.ip, b.ip)
  assert.notEqual(a.ipEmail, c.ipEmail)
  assert.equal(a.ip, c.ip)
})

test('한도: 좁은 키(IP+이메일)가 넓은 키(IP)보다 빡빡하다', () => {
  assert.ok(LOGIN_LIMITS.perIpEmail.limit < LOGIN_LIMITS.perIp.limit)
  assert.equal(LOGIN_LIMITS.perIpEmail.windowSec, 15 * 60)
})
