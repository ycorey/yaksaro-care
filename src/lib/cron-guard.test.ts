import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { PostgrestError } from '@supabase/supabase-js'
import { cronDbFailure, settledFailures } from './cron-guard.ts'
import { setLogReporter } from './logger.ts'

// 로거가 콘솔을 더럽히지 않게 감싼다(로그 자체는 별도 테스트 대상).
function quiet<T>(run: () => T): T {
  const orig = console.error
  console.error = () => {}
  setLogReporter(null)
  try { return run() } finally { console.error = orig }
}

const pgError = (code: string, message: string) =>
  ({ code, message, details: '', hint: '' }) as PostgrestError

test('에러가 없으면 null — 정상 흐름을 막지 않는다', () => {
  assert.equal(quiet(() => cronDbFailure('cron:test', '푸시 구독', null)), null)
})

test('에러가 있으면 500 — 200 이면 Vercel 이 성공으로 기록해 장애가 묻힌다', () => {
  const f = quiet(() => cronDbFailure('cron:test', '푸시 구독', pgError('08006', 'connection failure')))
  assert.ok(f, '실패 시 실패 기술자를 돌려줘야 한다')
  assert.equal(f.status, 500)
  assert.match(f.body.error, /푸시 구독/)
  assert.equal(f.body.code, '08006')
})

test('본문에 원문 메시지를 싣지 않는다 — 원문은 서버 로그로만', () => {
  const f = quiet(() => cronDbFailure('cron:test', '알림 설정', pgError('42501', 'permission denied for table profiles')))
  assert.doesNotMatch(JSON.stringify(f!.body), /permission denied/)
})

test('code 가 없는 에러도 처리한다', () => {
  const f = quiet(() => cronDbFailure('cron:test', '활성 복약', { message: 'boom' } as PostgrestError))
  assert.equal(f!.body.code, null)
})

test('settledFailures — rejected 만 센다', () => {
  const results: PromiseSettledResult<unknown>[] = [
    { status: 'fulfilled', value: 1 },
    { status: 'rejected', reason: new Error('x') },
    { status: 'rejected', reason: new Error('y') },
  ]
  assert.equal(settledFailures(results), 2)
  assert.equal(settledFailures([]), 0)
})
