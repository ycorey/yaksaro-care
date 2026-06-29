// POST /api/evidence — PubMed 검색 → 근거 등급(A/B/C) 판정 → 한국어 요약 (30일 캐시)
//
// 약사로케어 상호작용 체커 + 생활정보 + 블로그 "vs" 비교 포스트 공용.
// PubMed/Claude 호출이 비싸므로 query_key 단위로 Supabase(pubmed_cache)에 캐싱한다.
// 캐시는 전역(user-scope 아님)이라 admin client(service_role)로만 read/write.
//
// 요청: {
//   query?: string,                         // 일반 검색어 (drug+nutrient 주면 무시)
//   drug?: string, nutrient?: string,       // 약물-영양소 고갈/상호작용 모드
//   context: 'interaction' | 'blog' | 'lifestyle',
//   grade?: 'A' | 'B' | 'C',                // 이 등급 이상만 (A면 쿼리단도 A로 좁힘)
//   fromYear?: number,
// }
// 응답: { cached: boolean, results: EvidenceResult[], summary_ko: string }
//   results[i] 에 grade·gradeLabel·gradeReasons·publicationTypes 보존.

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import {
  searchGradedEvidence,
  type GradedArticle,
  type EvidenceGrade,
} from '@/lib/evidence-grade'
import { summarizeForKorean, type EvidenceContext } from '@/lib/summarize'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'
export const maxDuration = 60

const CACHE_DAYS = 30
const CONTEXTS: EvidenceContext[] = ['interaction', 'blog', 'lifestyle']
const GRADES: EvidenceGrade[] = ['A', 'B', 'C']

// 논문 결과(등급 포함)에 한국어 요약을 합친 형태(캐시에 raw_results로 저장).
type EvidenceResult = GradedArticle & { summary_ko: string }

type EvidenceBody = {
  query?: string
  drug?: string
  nutrient?: string
  context: EvidenceContext
  grade?: EvidenceGrade
  fromYear?: number
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

// 검색 식별 + 등급/연도 옵션을 캐시 키 하나로 수렴(옵션이 다르면 다른 캐시 행).
function buildQueryKey(b: EvidenceBody): string {
  const base = b.drug && b.nutrient ? `dn:${norm(b.drug)}+${norm(b.nutrient)}` : norm(b.query ?? '')
  const parts = [base]
  if (b.grade) parts.push(`g=${b.grade}`)
  if (b.fromYear) parts.push(`y=${b.fromYear}`)
  return parts.join('|')
}

export async function POST(request: Request) {
  // 인증 게이트 — PubMed + Claude 유료 호출/캐시 쓰기 전에 로그인 사용자만 허용(비용 남용 방지)
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  let raw: Record<string, unknown>
  try {
    raw = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: '잘못된 요청 본문입니다.' }, { status: 400 })
  }

  const query = typeof raw.query === 'string' ? raw.query : undefined
  const drug = typeof raw.drug === 'string' ? raw.drug : undefined
  const nutrient = typeof raw.nutrient === 'string' ? raw.nutrient : undefined
  const context = raw.context as EvidenceContext
  const grade = typeof raw.grade === 'string' ? (raw.grade as EvidenceGrade) : undefined
  const fromYear = typeof raw.fromYear === 'number' ? raw.fromYear : undefined

  const hasQuery = Boolean((query && query.trim()) || (drug && nutrient))
  if (!hasQuery) {
    return NextResponse.json(
      { error: 'query 또는 (drug + nutrient)가 필요합니다.' },
      { status: 400 },
    )
  }
  if (!CONTEXTS.includes(context)) {
    return NextResponse.json(
      { error: "context는 'interaction' | 'blog' | 'lifestyle' 중 하나여야 합니다." },
      { status: 400 },
    )
  }
  if (grade && !GRADES.includes(grade)) {
    return NextResponse.json({ error: "grade는 'A' | 'B' | 'C'여야 합니다." }, { status: 400 })
  }

  const body: EvidenceBody = { query, drug, nutrient, context, grade, fromYear }
  const queryKey = buildQueryKey(body)
  const supabase = createAdminClient()

  try {
    // 1) 캐시 조회 (만료 안 지난 것)
    const { data: cached } = await supabase
      .from('pubmed_cache')
      .select('raw_results, summary_ko')
      .eq('query_key', queryKey)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()

    if (cached) {
      return NextResponse.json({
        cached: true,
        results: (cached.raw_results as EvidenceResult[]) ?? [],
        summary_ko: cached.summary_ko ?? '',
      })
    }

    // 2) 캐시 미스 → 등급 판정 검색
    const papers = await searchGradedEvidence({
      query,
      drug,
      nutrient,
      minGrade: grade,
      targetGrade: grade === 'A' ? 'A' : undefined,
      fromYear,
    })
    if (papers.length === 0) {
      // 결과 없음은 캐싱하지 않는다(일시적 장애·과도하게 좁은 검색·등급 필터일 수 있음).
      return NextResponse.json({ cached: false, results: [], summary_ko: '' })
    }

    // 3) Claude 한국어 요약 (실패 시 throw → 캐싱하지 않고 5xx)
    const summary = await summarizeForKorean(papers, context)
    const summaryByPmid = new Map(summary.items.map((it) => [it.pmid, it.summary_ko]))
    const results: EvidenceResult[] = papers.map((p) => ({
      ...p,
      summary_ko: summaryByPmid.get(p.pmid) ?? '',
    }))

    // 4) 캐시 저장 (query_key 충돌 시 갱신, 만료 30일 재설정)
    const now = Date.now()
    const { error: upsertError } = await supabase.from('pubmed_cache').upsert(
      {
        query_key: queryKey,
        raw_results: results as unknown as never, // EvidenceResult[] → jsonb
        summary_ko: summary.overall_ko,
        created_at: new Date(now).toISOString(),
        expires_at: new Date(now + CACHE_DAYS * 24 * 60 * 60 * 1000).toISOString(),
      },
      { onConflict: 'query_key' },
    )
    if (upsertError) {
      // 캐시 저장 실패는 치명적이지 않다 — 결과는 그대로 반환하고 로그만 남긴다.
      logger.warn('evidence', '캐시 저장 실패', upsertError.message)
    }

    return NextResponse.json({ cached: false, results, summary_ko: summary.overall_ko })
  } catch (err) {
    logger.error('evidence', `처리 실패: "${queryKey}"`, err)
    return NextResponse.json({ error: '근거 수집 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
