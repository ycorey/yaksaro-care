// 식약처 원문(e약은요)을 화면에서 접기 위한 문장 단위 구조화.
//
// ⚠️ 이 모듈은 원문 글자를 절대 바꾸지 않는다. 고르고 재배열만 한다.
// 주의사항 길이의 대부분은 **금기 대상 목록**이라(과민증·녹내장·전립선비대…),
// 요약하면 그 목록에서 항목이 빠진다. 약 설명에서 누락은 추가만큼 위험하다 —
// "녹내장"이 빠진 요약을 녹내장 환자가 읽는 상황이 된다.
// drug-text.test.ts 의 "단일 공백으로 정규화되어 재조립하면 원문과 같다" 가 그 계약을 고정한다.

// 마침표 앞 음절이 한국어 종결형일 때만 자른다. 마침표 전부를 기준으로 자르면
// `1일 5회(75 mg/kg)`·`3.0~3.7` 같은 용량·비율 표기가 문장을 쪼갠다.
// 관찰된 종결형: …마십시오. …상의하십시오. …주의하십시오. …합니다. …있습니다.
// matchAll을 사용해 마침표를 포함한 문장들을 추출하고, 매치되지 않은 꼬리를 보존한다.
// .*? 는 임의의 문자(마침표 포함)를 non-greedy로 매칭하므로 소수점 표기를 보존한다.
//
// 재조립: join(' ')을 사용하면 단일 공백으로 정규화된다. 원본의 여러 공백은
// 단일 공백으로 통합되지만, 글자는 한 글자도 손실되지 않는다.
// (e약은요 원문이 항상 단일 공백으로 형식화되므로 실무상 영향 없음)
const SENTENCE_PATTERN = /.*?[다요오]\.(\s*)/g

export function splitSentences(text: string | null | undefined): string[] {
  if (!text) return []
  const normalized = String(text).replace(/\r?\n+/g, ' ')

  // matchAll로 모든 매치를 추적하면서 인덱스도 기록
  const matches = Array.from(normalized.matchAll(SENTENCE_PATTERN))

  if (matches.length === 0) {
    return [normalized].filter(Boolean)
  }

  const sentences: string[] = []

  // 각 매치된 문장을 추가 (공백은 정규화: join(' ')용으로 단일 공백 가정)
  for (const match of matches) {
    const fullText = match[0]  // 마침표 + 뒤따르는 공백
    const whitespace = match[1]  // capture group 1: 마침표 뒤 공백
    const sentenceWithoutWhitespace = fullText.slice(0, fullText.length - whitespace.length)
    // 공백을 trim하면 단일 공백으로 정규화됨 (join(' ')과 호환)
    sentences.push(sentenceWithoutWhitespace.trim())
  }

  // 종결형으로 끝나지 않는 꼬리 텍스트 보존 (Critical fix)
  const lastMatch = matches[matches.length - 1]
  const endIndex = lastMatch.index + lastMatch[0].length
  if (endIndex < normalized.length) {
    const tail = normalized.slice(endIndex).trim()
    if (tail) sentences.push(tail)
  }

  return sentences.filter(Boolean)
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
