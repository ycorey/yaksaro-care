// PubMed 초록 → 한국어 요약 (Claude). 약사로케어 상호작용 체커 + 블로그 공용.
//
// 모델은 claude-sonnet-4-6(사용자 지정). 단일 호출로 논문별 요약 + 전체 핵심 1줄을
// 구조화 출력(output_config.format)으로 받아 JSON 파싱 실패 위험을 없앤다.
// 요약은 비싸므로 호출부(API route)에서 캐싱한다. 여기서는 순수 변환만 담당.
//
// 약사법 광고규제: '치료된다' 같은 의학적 단정 금지 → '연구에서 ~경향이 보고됨' 톤.
// ANTHROPIC_API_KEY는 환경변수에서만 읽는다(하드코딩 금지).

import Anthropic from '@anthropic-ai/sdk'
import type { PubmedResult } from '@/lib/pubmed'
import { logger } from '@/lib/logger'

const MODEL = 'claude-sonnet-4-6'

export type EvidenceContext = 'interaction' | 'blog'

export type PaperSummary = { pmid: string; summary_ko: string }
export type EvidenceSummary = { overall_ko: string; items: PaperSummary[] }

const SUMMARY_SCHEMA = {
  type: 'object',
  properties: {
    overall_ko: { type: 'string' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          pmid: { type: 'string' },
          summary_ko: { type: 'string' },
        },
        required: ['pmid', 'summary_ko'],
        additionalProperties: false,
      },
    },
  },
  required: ['overall_ko', 'items'],
  additionalProperties: false,
} as const

function buildSystemPrompt(context: EvidenceContext): string {
  const audience =
    context === 'interaction'
      ? '약사·임상 관점에서 약물 상호작용 판단에 참고할 핵심을 짚는다.'
      : '일반 독자가 이해할 수 있게 쉬운 말로 풀되 과장하지 않는다.'
  return [
    '당신은 의약 논문 초록을 한국어로 요약하는 약사입니다.',
    audience,
    '각 논문은 2~3줄로 요약하고, 전체를 관통하는 핵심을 1줄로 정리하세요.',
    '약사법 광고규제를 반드시 지키세요: "치료된다", "효과가 확실하다" 같은 의학적 단정 금지.',
    '대신 "연구에서 ~경향이 보고됨", "~와 관련이 있는 것으로 나타남" 같은 신중한 톤을 사용하세요.',
    '초록에 없는 내용을 지어내지 마세요.',
  ].join('\n')
}

function buildUserPrompt(papers: PubmedResult[]): string {
  return papers
    .map(
      (p, i) =>
        `[논문 ${i + 1}] PMID: ${p.pmid}\n제목: ${p.title}\n출처: ${p.journal} (${p.year})\n초록: ${p.abstract || '(초록 없음)'}`,
    )
    .join('\n\n')
}

/**
 * PubMed 초록 배열을 한국어로 요약. 빈 입력이면 빈 요약 반환.
 * 실패(키 없음·API 오류)는 throw → 호출부가 캐싱하지 않고 5xx 처리.
 */
export async function summarizeForKorean(
  papers: PubmedResult[],
  context: EvidenceContext,
): Promise<EvidenceSummary> {
  if (papers.length === 0) return { overall_ko: '', items: [] }

  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다.')
  }

  const client = new Anthropic() // ANTHROPIC_API_KEY를 환경변수에서 읽음

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    thinking: { type: 'disabled' }, // 요약은 단순 작업 → 비용·지연 절감
    output_config: {
      effort: 'low',
      format: { type: 'json_schema', schema: SUMMARY_SCHEMA },
    },
    system: buildSystemPrompt(context),
    messages: [{ role: 'user', content: buildUserPrompt(papers) }],
  })

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')

  try {
    const parsed = JSON.parse(text) as EvidenceSummary
    return {
      overall_ko: parsed.overall_ko ?? '',
      items: Array.isArray(parsed.items) ? parsed.items : [],
    }
  } catch (err) {
    logger.error('summarize', 'JSON 파싱 실패', err)
    throw new Error('요약 응답을 파싱하지 못했습니다.')
  }
}
