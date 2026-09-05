import { test } from 'node:test'
import assert from 'node:assert/strict'
import { HEALTH_TIPS, getDailyTip } from './health-tips.ts'

// 문구 QA(2026-09-05): 지어낸 문장이 "혈당과 기분이 함께 좋아져요" 처럼 단정하고 있었다(8건).
// 이후 공공기관 원문 **발췌 + 출처 표기** 로 바꿨다. 이 테스트는 두 가지를 지킨다 —
// (1) 원문이라도 앱이 쓰지 않기로 한 어조는 고르지 않는다, (2) 출처 표기·발췌 규칙이 빠지지 않는다.

// ── (1) 어조 — 효과 단언·약과의 비교·용량 지시·음성 판정 ──────────────────
// "도움이 돼요 / 줄일 수 있어요 / ~하는 것이 바람직하다" 같은 가능성·권고 표현은 허용한다.
const ASSERTIVE = [
  // 조사(이·가·에·도…) 뒤의 '좋아요' 만 효과 단언이다 — "처방대로 드시는 게 좋아요" 는 권유라 통과
  /(이|가|에|도|은|는)\s*좋아(져요|요|집니다)\s*\.?$/,
  /가라앉아요\s*\.?$/,
  /정확한 진료를 받아요/,
  /안정적이에요/,
]
const COMPARES_TO_DRUG = /약보다/
const DOSING_INSTRUCTION = /(두 배|절반|반 알|용량을).*(드시|드세요|마세요|줄이|늘리)/
// 스토어 게이트(e2e/store-readiness-qa BANNED)와 같은 음성 판정 — 여기 문구가 걸리면 제출이 막힌다.
const NEGATIVE_VERDICT = /검출되지\s*않|이상\s*없|문제\s*없|괜찮(습니다|아요)|정상(입니다|이에요)|부작용\s*(이|은)?\s*없|안전(합니다|해요|함|하십니다)/

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

// ── (2) 출처·발췌 규칙 ───────────────────────────────────────────────
test('모든 문장에 공공누리 제1유형 출처가 붙어 있다', () => {
  for (const t of HEALTH_TIPS) {
    assert.equal(t.source.license, '공공누리 제1유형', t.text)
    assert.ok(t.source.org && t.source.title, `기관·제목 누락: ${t.text}`)
    // 유형을 기사 단위로 확인한 곳은 정책브리핑뿐이다 — 다른 도메인이 들어오면 확인 절차를 거쳐 여기를 넓힐 것
    assert.match(t.source.url, /^https:\/\/www\.korea\.kr\/news\/policyNewsView\.do\?newsId=\d+$/, t.source.url)
    assert.match(t.source.published, /^\d{4}-\d{2}-\d{2}$/, t.source.title)
  }
})

test('발췌 규칙 — 문두 접속부사는 제거하고, 문장은 온전한 끝맺음을 갖는다', () => {
  for (const t of HEALTH_TIPS) {
    assert.ok(!/^(또한|특히|아울러|먼저|가령|이에|한편|이밖에|마지막으로)\s/.test(t.text), `접속부사로 시작: ${t.text}`)
    assert.match(t.text, /[.다]$/, `끝맺음 없음: ${t.text}`)
    assert.ok(!/&[a-z]+;/.test(t.text), `HTML 엔티티 잔존: ${t.text}`)
  }
})

test('실버 세대 화면 — 한 문장이 120자를 넘지 않고, 같은 문장이 두 번 없다', () => {
  const seen = new Set<string>()
  for (const t of HEALTH_TIPS) {
    assert.ok(t.text.length <= 120, `${t.text.length}자: ${t.text}`)
    assert.ok(!seen.has(t.text), `중복: ${t.text}`)
    seen.add(t.text)
  }
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
