import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveDuplicates, sanitizeElderlyNote } from './dur-flags.ts'

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

// ── sanitizeElderlyNote ────────────────────────────────────────────────
// 식약처 PROHBT_CONTENT 원문은 **처방자에게 쓴 글**이라 "…소량부터 신중투여" 처럼
// 투여 지시로 끝난다. 환자 화면에 그대로 실으면 "적게 드세요"라는 용량 조절 지시로
// 읽히고, 웰니스(비의료기기) 판정의 기둥인 "용량 조절 제시 0"과 충돌한다.
// 아래 3종은 운영 DB 비폴백 원문 전량(58행/3종, 2026-08-27 실측) — 전부 벤조·항정신병약·
// 삼환계 항우울제라 자의 감량이 실제로 위험한 약들이다.

test('벤조다이아제핀 원문 — 투여 지시가 제거되고 사실 서술로 닫힌다', () => {
  const out = sanitizeElderlyNote('노인에서의 장기지속형 벤조다이아제핀 사용은 운동실조, 과진정 등이 나타나기 쉬움으로 소량부터 신중투여')
  assert.ok(out)
  assert.ok(!/신중\s*투여|소량/.test(out), `지시문 잔존: ${out}`)
  assert.match(out, /운동실조/)          // 사실(부작용 경향)은 남는다
  assert.match(out, /등재되어 있어요\.$/)
})

test('항정신병약물 원문 — "쉬우므로" 어미도 처리된다', () => {
  const out = sanitizeElderlyNote('노인에서의 정형 항정신병약물 사용은 추체외로 증상, 항콜린성 부작용 등이 나타나기 쉬우므로 신중투여')
  assert.ok(out)
  assert.ok(!/신중\s*투여/.test(out), `지시문 잔존: ${out}`)
  assert.match(out, /추체외로 증상/)
})

test('삼환계 항우울제 원문 — "소량으로 신중투여" 제거', () => {
  const out = sanitizeElderlyNote('노인에서의 삼환계 항우울제 사용은 기립성 저혈압, 비틀거림, 항콜린작용에 의한 구갈, 배뇨곤란, 변비, 안내압항진 등이 나타나기 쉬움으로 소량으로 신중투여')
  assert.ok(out)
  assert.ok(!/신중\s*투여|소량/.test(out), `지시문 잔존: ${out}`)
  assert.match(out, /기립성 저혈압/)
})

test('"성분: X" 폴백은 등재 내용이 아니므로 표시하지 않는다', () => {
  assert.equal(sanitizeElderlyNote('성분: 클로르페니라민'), null)
  assert.equal(sanitizeElderlyNote('성분:아세클로페낙'), null)
})

test('알 수 없는 지시 어미가 남으면 표시를 포기한다 (미래 유입 방어)', () => {
  // ETL 이 계속 도는 한 더 강한 지시문이 들어올 수 있다 — 어중간하게 싣지 않는다
  assert.equal(sanitizeElderlyNote('노인에게는 이 약을 투여하지 말 것'), null)
  assert.equal(sanitizeElderlyNote('노인 환자는 복용을 중단할 것'), null)
})

test('빈 값은 null', () => {
  assert.equal(sanitizeElderlyNote(null), null)
  assert.equal(sanitizeElderlyNote(''), null)
  assert.equal(sanitizeElderlyNote('   '), null)
})
