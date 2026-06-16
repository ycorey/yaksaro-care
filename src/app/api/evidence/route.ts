// POST /api/evidence — PubMed 검색 → 한국어 요약 (30일 캐시)
//
// 약사로케어 상호작용 체커 + 블로그 "vs" 비교 포스트 공용.
// PubMed/Claude 호출이 비싸므로 query_key 단위로 Supabase(pubmed_cache)에 캐싱한다.
// 캐시는 전역(user-scope 아님)이라 admin client(service_role)로만 read/write.
//
// 요청: { query: string, context: 'interaction' | 'blog' }
// 응답: { cached: boolean, results: EvidenceResult[], summary_ko: string }

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { searchPubmed, type PubmedResult } from '@/lib/pubmed'
import { summarizeForKorean, type EvidenceContext } from '@/lib/summarize'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'
export const maxDuration = 60

const CACHE_DAYS = 30

// 논문 결과에 한국어 요약을 합친 형태(캐시에 raw_results로 저장).
type EvidenceResult = PubmedResult & { summary_ko: string }

// 검색어 정규화: 소문자 + 앞뒤 공백 제거 + 연속 공백 1칸. 동일 검색을 캐시 1행으로 수렴.
function normalizeQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, ' ')
}

export async function POST(request: Request) {
  let body: { query?: unknown; context?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청 본문입니다.' }, { status: 400 })
  }

  const { query, context } = body
  if (typeof query !== 'string' || query.trim() === '') {
    return NextResponse.json({ error: 'query는 비어 있지 않은 문자열이어야 합니다.' }, { status: 400 })
  }
  if (context !== 'interaction' && context !== 'blog') {
    return NextResponse.json(
      { error: "context는 'interaction' 또는 'blog'여야 합니다." },
      { status: 400 },
    )
  }

  const queryKey = normalizeQuery(query)
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

    // 2) 캐시 미스 → PubMed 검색
    const papers = await searchPubmed(query)
    if (papers.length === 0) {
      // 결과 없음은 캐싱하지 않는다(일시적 장애·과도하게 좁은 검색일 수 있음).
      return NextResponse.json({ cached: false, results: [], summary_ko: '' })
    }

    // 3) Claude 한국어 요약 (실패 시 throw → 캐싱하지 않고 5xx)
    const summary = await summarizeForKorean(papers, context as EvidenceContext)
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
