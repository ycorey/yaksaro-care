import { test } from 'node:test'
import assert from 'node:assert/strict'
import { HEALTH_TIPS, getDailyTip } from './health-tips.ts'

// 문구 QA(2026-09-05): 앱의 다른 건강 정보는 전부 "도움이 된다고 알려져 있어요" 로 헤지하는데
// 이 목록만 "혈당과 기분이 함께 좋아져요" 처럼 단정하고 있었다(8건). 한 번 고쳐도 새 문구가
// 추가되면 같은 톤이 돌아오므로, 어미·표현 단위로 여기서 막는다.
//
// 걸러야 하는 것은 **효과를 단언하는 어미**와 **약과의 비교**, **용량·복용 지시**다.
// "도움이 돼요 / 줄일 수 있어요 / 알 수 있어요" 같은 가능성·조력 표현은 허용한다.
const ASSERTIVE = [
  // 조사(이·가·에·도…) 뒤의 '좋아요' 만 효과 단언이다 — "처방대로 드시는 게 좋아요" 는 권유라 통과
  /(이|가|에|도|은|는)\s*좋아(져요|요|집니다)\s*\.?$/,
  /가라앉아요\s*\.?$/,               // "혈압이 한결 가라앉아요"
  /정확한 진료를 받아요/,
  /안정적이에요/,
]
const COMPARES_TO_DRUG = /약보다/
const DOSING_INSTRUCTION = /(두 배|절반|반 알|용량을).*(드시|드세요|마세요|줄이|늘리)/
// 스토어 게이트(e2e/store-readiness-qa BANNED)와 같은 음성 판정 — 여기 문구가 걸리면 제출이 막힌다.
// '안전해요' 하나는 물 vs 커피·우유 비교로 소스에 yc-allow-phrase 근거가 있어 그 문구만 예외로 둔다.
const NEGATIVE_VERDICT = /검출되지\s*않|이상\s*없|문제\s*없|괜찮(습니다|아요)|정상(입니다|이에요)|부작용\s*(이|은)?\s*없/

test('건강 한 줄은 효과를 단언하지 않는다', () => {
  for (const t of HEALTH_TIPS) {
    for (const re of ASSERTIVE) assert.ok(!re.test(t.text), `단정형: ${t.text}`)
  }
})

test('건강 한 줄은 약과 비교하거나 용량을 지시하지 않는다', () => {
  for (const t of HEALTH_TIPS) {
    assert.ok(!COMPARES_TO_DRUG.test(t.text), `약과 비교: ${t.text}`)
    assert.ok(!DOSING_INSTRUCTION.test(t.text), `용량 지시: ${t.text}`)
  }
})

test('건강 한 줄은 스토어 게이트의 음성 판정 문구를 쓰지 않는다', () => {
  for (const t of HEALTH_TIPS) assert.ok(!NEGATIVE_VERDICT.test(t.text), `음성 판정: ${t.text}`)
})

test('맞춤법 — 헐다 는 "허는" 으로 활용한다', () => {
  for (const t of HEALTH_TIPS) assert.ok(!/헐는/.test(t.text), t.text)
})

test('하루에 하나씩 돌고, 어떤 날이든 목록 안의 문구다', () => {
  const a = getDailyTip(new Date(2026, 0, 1))
  const b = getDailyTip(new Date(2026, 0, 2))
  assert.ok(HEALTH_TIPS.includes(a) && HEALTH_TIPS.includes(b))
  assert.notEqual(a, b)
})
