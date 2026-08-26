import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveDuplicates } from './dur-flags.ts'

// resolveDuplicates — 효능군중복 판정 (순수 함수).
// "중복"은 저장된 사실이 아니라 조회 시점의 사실이다: 같은 효능군(group_code)에 속한
// 약이 현재 등록 목록에 서로 다른 item_seq 로 2개 이상 있을 때만 성립한다.

const flags = (entries: Array<[string, string[]]>) =>
  new Map(entries.map(([seq, groups]) => [seq, { groups }]))

test('같은 효능군 약 2개 → 양쪽 다 군명이 붙는다', () => {
  const f = flags([['A', ['해열진통소염제']], ['B', ['해열진통소염제']]])
  const r = resolveDuplicates(f, ['A', 'B'])
  assert.equal(r.get('A'), '해열진통소염제')
  assert.equal(r.get('B'), '해열진통소염제')
})

test('군 소속 약이 1개뿐이면 중복이 아니다', () => {
  const f = flags([['A', ['해열진통소염제']], ['B', ['골다공증치료제']]])
  const r = resolveDuplicates(f, ['A', 'B'])
  assert.equal(r.get('A'), null)
  assert.equal(r.get('B'), null)
})

test('군에 속하지 않은 약은 null', () => {
  const f = flags([['A', ['해열진통소염제']]])
  const r = resolveDuplicates(f, ['A', 'C'])
  assert.equal(r.get('C'), null)
})

test('같은 약을 두 번 등록해도 중복으로 치지 않는다 (distinct item_seq 기준)', () => {
  // 같은 약 재등록은 효능군중복이 아니라 별개 문제 — 여기서 경고하면 오탐이다.
  const f = flags([['A', ['해열진통소염제']]])
  const r = resolveDuplicates(f, ['A', 'A'])
  assert.equal(r.get('A'), null)
})

test('여러 군에 속한 약은 실제로 겹친 군명을 반환한다', () => {
  const f = flags([['A', ['제산제', '해열진통소염제']], ['B', ['해열진통소염제']]])
  const r = resolveDuplicates(f, ['A', 'B'])
  assert.equal(r.get('A'), '해열진통소염제')
  assert.equal(r.get('B'), '해열진통소염제')
})

test('빈 목록·빈 플래그는 조용히 빈 결과', () => {
  const r = resolveDuplicates(new Map(), [])
  assert.equal(r.size, 0)
})
