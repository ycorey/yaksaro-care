import { test } from 'node:test'
import assert from 'node:assert/strict'
import { logger, setLogReporter, type LogReporter } from './logger.ts'

// console 노이즈 억제 + reporter 정리를 감싸는 헬퍼(모듈 싱글턴 누수 방지)
function withCapture(run: (calls: Parameters<LogReporter>[]) => void) {
  const orig = { error: console.error, warn: console.warn, info: console.info }
  console.error = () => {}; console.warn = () => {}; console.info = () => {}
  const calls: Parameters<LogReporter>[] = []
  setLogReporter((...args) => { calls.push(args) })
  try { run(calls) } finally {
    setLogReporter(null)
    Object.assign(console, orig)
  }
}

test('logger: 등록된 reporter가 error를 (level,scope,message,detail)로 받음', () => {
  withCapture((calls) => {
    const err = new Error('boom')
    logger.error('OCR', '실패', err)
    assert.equal(calls.length, 1)
    assert.deepEqual(calls[0], ['error', 'OCR', '실패', err])
  })
})

test('logger: warn도 reporter로 전달', () => {
  withCapture((calls) => {
    logger.warn('SYNC', '지연')
    assert.equal(calls.length, 1)
    assert.equal(calls[0][0], 'warn')
  })
})

test('logger: info는 reporter로 전달하지 않음(노이즈 억제)', () => {
  withCapture((calls) => {
    logger.info('APP', '시작')
    assert.equal(calls.length, 0)
  })
})

test('logger: reporter 미등록이면 아무 것도 전송 안 함(no-op, 예외 없음)', () => {
  const orig = console.error
  console.error = () => {}
  try {
    setLogReporter(null)
    assert.doesNotThrow(() => logger.error('X', '에러'))
  } finally { console.error = orig }
})

test('logger: reporter가 던져도 로깅·앱이 깨지지 않음(흡수)', () => {
  const orig = console.error
  console.error = () => {}
  try {
    setLogReporter(() => { throw new Error('수집기 장애') })
    assert.doesNotThrow(() => logger.error('X', '에러'))
  } finally {
    setLogReporter(null)
    console.error = orig
  }
})

test('logger: 콘솔에 Error 의 cause 체인이 남는다 — "fetch failed" 뒤의 진짜 원인', () => {
  // 회귀(8/21): undici 의 fetch 실패는 message 가 항상 "fetch failed" 이고 진짜 원인
  // (ENOTFOUND·ETIMEDOUT 등)은 cause 에 있다. emit 이 message 만 추려서 원인이
  // 로그에 남지 않았고, 프로덕션 장애 진단에 임시 배포까지 필요했다.
  const orig = { error: console.error, warn: console.warn, info: console.info }
  const lines: unknown[][] = []
  console.error = (...a: unknown[]) => { lines.push(a) }
  console.warn = () => {}; console.info = () => {}
  try {
    const inner = Object.assign(new Error('getaddrinfo ENOTFOUND example.com'), { code: 'ENOTFOUND' })
    const outer = new Error('fetch failed', { cause: inner })
    logger.error('OCR', '처리 오류', outer)
    const payload = String(lines[0]?.[1] ?? '')
    assert.ok(payload.includes('fetch failed'), `겉메시지 없음: ${payload}`)
    assert.ok(payload.includes('ENOTFOUND'), `cause 유실: ${payload}`)
  } finally {
    Object.assign(console, orig)
  }
})
