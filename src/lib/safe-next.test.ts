import { test } from 'node:test'
import assert from 'node:assert/strict'
import { safeNextPath } from './safe-next.ts'

test('내부 경로는 그대로 통과', () => {
  assert.equal(safeNextPath('/medications/add'), '/medications/add')
  assert.equal(safeNextPath('/wallet?added=rx#top'), '/wallet?added=rx#top')
})

test('비었거나 상대 경로·절대 URL 은 거절', () => {
  assert.equal(safeNextPath(null), null)
  assert.equal(safeNextPath(''), null)
  assert.equal(safeNextPath('home'), null)
  assert.equal(safeNextPath('https://evil.com'), null)
})

test('프로토콜 상대 URL 은 거절', () => {
  assert.equal(safeNextPath('//evil.com'), null)
})

test('역슬래시 우회 — 브라우저는 /\\ 를 // 로 읽는다', () => {
  assert.equal(safeNextPath('/\\evil.com'), null)
  assert.equal(safeNextPath('/\\/evil.com'), null)
})

test('탭·개행 우회 — 브라우저 파서는 이 문자들을 지운다', () => {
  assert.equal(safeNextPath('/\t/evil.com'), null)
  assert.equal(safeNextPath('/\n/evil.com'), null)
})
