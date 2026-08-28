import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toLifestyleTip } from './server.ts'

const base = { disease: '당뇨', topic: '식단', body_ko: '당뇨를 관리하는 분들께 일반적으로 도움이 된다고 알려져 있습니다.', sources: [] }

test('안전한 요약은 채택한다', () => {
  const tip = toLifestyleTip({ ...base, summary_ko: '당뇨를 관리하는 분들께 저탄수화물 식단이 도움이 된다고 알려져 있습니다.' })
  assert.ok(tip.summary_ko)
})

test('게이트에 걸린 요약은 버리고 본문은 남긴다', () => {
  // 개인 지시형 문구는 FORBIDDEN_PATTERNS 에 걸린다
  const tip = toLifestyleTip({ ...base, summary_ko: '지금 드시는 약을 중단하세요.' })
  assert.equal(tip.summary_ko, null)
  assert.equal(tip.body_ko, base.body_ko)   // 정보 자체는 사라지지 않는다
})

test('요약이 없으면 null', () => {
  assert.equal(toLifestyleTip({ ...base, summary_ko: null }).summary_ko, null)
})

test('url 없는 출처는 걸러낸다', () => {
  const tip = toLifestyleTip({ ...base, summary_ko: null, sources: [{ url: 'https://x' }, { url: '' }] })
  assert.equal(tip.sources.length, 1)
})
