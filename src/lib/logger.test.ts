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
