import { test } from 'node:test'
import assert from 'node:assert/strict'
import { redactDetail } from './redact-detail.ts'

// dbError(api-error.ts)가 logger 로 넘기는 실제 모양.
const dbErrorDetail = (over: Partial<Record<string, unknown>> = {}) => ({
  code: '23505',
  message: 'duplicate key value violates unique constraint "push_subscriptions_endpoint_key"',
  details: 'Key (endpoint)=(https://fcm.googleapis.com/fcm/send/abc123) already exists.',
  hint: undefined,
  ...over,
})

test('23505 의 details 는 엔드포인트 원문을 담는다 — 지운다', () => {
  const out = redactDetail(dbErrorDetail())
  assert.ok(!out.includes('fcm.googleapis.com'), `엔드포인트가 남았다: ${out}`)
  assert.ok(out.includes('[값 제거됨]'), '지웠다는 표시는 남아야 한다(빈 값과 구별)')
})

test('code·message 는 남는다 — 이게 없으면 진단이 통째로 사라진다', () => {
  const out = redactDetail(dbErrorDetail())
  assert.ok(out.includes('23505'), 'code 가 사라졌다')
  assert.ok(out.includes('push_subscriptions_endpoint_key'), '제약 이름이 사라졌다')
})

test('23514 의 "Failing row contains" 에는 실명·약품명이 그대로 들어온다', () => {
  const out = redactDetail(dbErrorDetail({
    code: '23514',
    message: 'new row for relation "user_medications" violates check constraint "chk_doses"',
    details: 'Failing row contains (9f1c…, 김상우, 와파린정 5mg, 3, null).',
  }))
  assert.ok(!out.includes('김상우'), `실명이 새어나갔다: ${out}`)
  assert.ok(!out.includes('와파린'), `약품명이 새어나갔다: ${out}`)
})

test('hint 는 남긴다 — PGRST200 을 진단해 준 것이 이 문자열이다', () => {
  const out = redactDetail({
    code: 'PGRST200',
    message: "Could not find a relationship between 'profiles' and 'pharmacies'",
    details: null,
    hint: "Perhaps you meant 'pharmacies' related to 'auth.users'",
  })
  assert.ok(out.includes('Perhaps you meant'), 'hint 가 사라지면 8/11 유형을 다시 못 잡는다')
})

test('문자열 detail 은 그대로 통과 — cronDbFailure 는 message 만 넘긴다', () => {
  assert.equal(redactDetail('connection failure'), 'connection failure')
})

test('300자를 넘으면 자른다 — 객체 전문이 실리는 것을 막는다', () => {
  const out = redactDetail('가'.repeat(500))
  assert.equal(out.length, 301, '300자 + 말줄임표')
  assert.ok(out.endsWith('…'))
})

test('중첩된 details 도 잡는다 — 감싸서 넘기는 호출부가 있다', () => {
  const out = redactDetail({ scope: 'api/medications', error: dbErrorDetail() })
  assert.ok(!out.includes('fcm.googleapis.com'), `중첩되면 빠져나간다: ${out}`)
})

test('순환 참조여도 던지지 않고, 원문도 흘리지 않는다', () => {
  const circular: Record<string, unknown> = { details: '김상우' }
  circular.self = circular
  const out = redactDetail(circular)
  assert.equal(out, '[직렬화 불가]')
})

test('undefined 는 로거가 걸러주지만, 여기서도 원문을 만들지 않는다', () => {
  assert.equal(redactDetail(undefined), '[undefined]')
})
