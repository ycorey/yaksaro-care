// 식약처 원문(e약은요)을 화면에서 접기 위한 문장 단위 구조화.
//
// ⚠️ 이 모듈은 원문 글자를 절대 바꾸지 않는다. 고르고 재배열만 한다.
// 주의사항 길이의 대부분은 **금기 대상 목록**이라(과민증·녹내장·전립선비대…),
// 요약하면 그 목록에서 항목이 빠진다. 약 설명에서 누락은 추가만큼 위험하다 —
// "녹내장"이 빠진 요약을 녹내장 환자가 읽는 상황이 된다.
// drug-text.test.ts 의 "재조립하면 원문과 같다" 가 그 계약을 고정한다.

// 마침표 앞 음절이 한국어 종결형일 때만 자른다. 마침표 전부를 기준으로 자르면
// `1일 5회(75 mg/kg)`·`3.0~3.7` 같은 용량·비율 표기가 문장을 쪼갠다.
// 관찰된 종결형: …마십시오. …상의하십시오. …주의하십시오. …합니다. …있습니다.
// match를 사용해 마침표를 포함한 문장들을 추출한다.
// .*? 는 임의의 문자(마침표 포함)를 non-greedy로 매칭하므로 소수점 표기를 보존한다.
const SENTENCE_PATTERN = /.*?[다요오]\.(?:\s+|$)/g

export function splitSentences(text: string | null | undefined): string[] {
  if (!text) return []
  const normalized = String(text).replace(/\r?\n+/g, ' ')
  const sentences = normalized.match(SENTENCE_PATTERN) || []
  return sentences
    .map(s => s.trim())
    .filter(Boolean)
}

// 어미 매칭만 한다 — 의미 해석이 아니라 결정론적 분류다.
const PROHIBIT = /(복용하지 마십시오|투여하지 마십시오|사용하지 마십시오|금기)/
const CONSULT  = /(상의하십시오|상담하십시오|문의하십시오)/

export function groupCautions(sentences: string[]) {
  const prohibit: string[] = []
  const consult:  string[] = []
  const caution:  string[] = []
  for (const s of sentences) {
    if (PROHIBIT.test(s)) prohibit.push(s)
    else if (CONSULT.test(s)) consult.push(s)
    else caution.push(s)
  }
  return { prohibit, consult, caution }
}

/** 표시 순서(금기 → 상담 → 주의)로 평탄화. 분리 실패 시 원문 1개. */
export function orderedCautions(text: string | null | undefined): string[] {
  const sentences = splitSentences(text)
  if (sentences.length < 2) {
    // 분리 실패: 원문이 있으면 통째로 돌려준다
    if (text) return [text]
    return sentences
  }
  const g = groupCautions(sentences)
  return [...g.prohibit, ...g.consult, ...g.caution]
}
