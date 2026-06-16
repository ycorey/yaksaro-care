// PubMed(NCBI E-utilities) 연동 — 검색어 → PMID → 초록.
//
// 무료 API, 키 불필요. NCBI_API_KEY가 있으면 rate limit이 3→10 req/s로 올라가므로
// 있으면 쿼리에 붙인다. efetch는 초록을 XML로만 주므로 fast-xml-parser로 파싱한다.
// 외부 호출은 5초 타임아웃, 실패·결과없음은 모두 빈 배열로 수렴(상위에서 graceful).

import { XMLParser } from 'fast-xml-parser'
import { logger } from '@/lib/logger'

const EUTILS = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils'
const TIMEOUT_MS = 5000

export type PubmedResult = {
  pmid: string
  title: string
  journal: string
  year: string
  abstract: string
  url: string
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
})

// XML 노드는 string | number | {#text} | 배열 | 마크업 중첩 객체일 수 있다.
// 모든 텍스트 조각을 재귀로 긁어모아 평문 문자열로 만든다.
function textOf(node: unknown): string {
  if (node == null) return ''
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join(' ')
  if (typeof node === 'object') {
    return Object.entries(node as Record<string, unknown>)
      .filter(([k]) => !k.startsWith('@_')) // 속성 제외
      .map(([, v]) => textOf(v))
      .join(' ')
  }
  return ''
}

// AbstractText는 string | {#text,@_Label} | 그 배열. Label 있으면 "LABEL: 본문"으로 합친다.
function abstractOf(abstractNode: unknown): string {
  if (abstractNode == null) return ''
  const at = (abstractNode as Record<string, unknown>).AbstractText
  if (at == null) return textOf(abstractNode)
  const parts = Array.isArray(at) ? at : [at]
  return parts
    .map((p) => {
      const label =
        p && typeof p === 'object' ? (p as Record<string, unknown>)['@_Label'] : undefined
      const body = textOf(p).trim()
      return label ? `${String(label)}: ${body}` : body
    })
    .filter(Boolean)
    .join('\n')
    .trim()
}

function withApiKey(url: string): string {
  const key = process.env.NCBI_API_KEY
  return key ? `${url}&api_key=${encodeURIComponent(key)}` : url
}

async function fetchWithTimeout(url: string): Promise<Response> {
  return fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
}

// 1) esearch: 검색어 → 관련도순 PMID 목록(최대 retmax개)
async function searchPmids(query: string, retmax: number): Promise<string[]> {
  const url = withApiKey(
    `${EUTILS}/esearch.fcgi?db=pubmed&retmode=json&sort=relevance` +
      `&retmax=${retmax}&term=${encodeURIComponent(query)}`,
  )
  const res = await fetchWithTimeout(url)
  if (!res.ok) throw new Error(`esearch ${res.status}`)
  const json = (await res.json()) as { esearchresult?: { idlist?: string[] } }
  return json.esearchresult?.idlist ?? []
}

// 2) efetch: PMID들 → 초록 XML → 구조화 결과
async function fetchAbstracts(pmids: string[]): Promise<PubmedResult[]> {
  const url = withApiKey(
    `${EUTILS}/efetch.fcgi?db=pubmed&rettype=abstract&retmode=xml&id=${pmids.join(',')}`,
  )
  const res = await fetchWithTimeout(url)
  if (!res.ok) throw new Error(`efetch ${res.status}`)
  const xml = await res.text()
  const parsed = parser.parse(xml) as Record<string, unknown>

  const set = parsed.PubmedArticleSet as Record<string, unknown> | undefined
  const rawArticles = set?.PubmedArticle
  if (!rawArticles) return []
  const articles = Array.isArray(rawArticles) ? rawArticles : [rawArticles]

  return articles.map((art) => {
    const a = art as Record<string, unknown>
    const citation = (a.MedlineCitation ?? {}) as Record<string, unknown>
    const article = (citation.Article ?? {}) as Record<string, unknown>
    const journal = (article.Journal ?? {}) as Record<string, unknown>
    const pubDate =
      ((journal.JournalIssue as Record<string, unknown>)?.PubDate as Record<string, unknown>) ?? {}

    const pmid = textOf(citation.PMID).trim()
    return {
      pmid,
      title: textOf(article.ArticleTitle).trim(),
      journal: textOf(journal.Title).trim(),
      year: textOf(pubDate.Year || pubDate.MedlineDate).trim(),
      abstract: abstractOf(article.Abstract),
      url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
    }
  })
}

/**
 * PubMed 검색 → 초록 배열. 결과 없거나 에러/타임아웃이면 빈 배열.
 * @param query  검색어(영문 권장)
 * @param retmax 최대 결과 수(기본 5)
 */
export async function searchPubmed(query: string, retmax = 5): Promise<PubmedResult[]> {
  const q = query.trim()
  if (!q) return []
  try {
    const pmids = await searchPmids(q, retmax)
    if (pmids.length === 0) return []
    return await fetchAbstracts(pmids)
  } catch (err) {
    logger.error('pubmed', `검색 실패: "${q}"`, err)
    return []
  }
}
