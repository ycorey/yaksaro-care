// PubMed 근거 커넥터 — 블로그 글쓰기 워크플로에서 호출하는 CLI.
//
// /api/evidence 를 호출해 PubMed 검색 + 한국어 요약을 받아,
// 블로그 본문에 바로 붙일 수 있는 마크다운(요약 + 각주식 출처 링크)으로 출력한다.
//
// 사용법:
//   node scripts/fetch-evidence.mjs "검색어" [blog|interaction]
// 예:
//   node scripts/fetch-evidence.mjs "마그네슘 수면 효과" blog
//
// 호출 대상 URL은 EVIDENCE_API_URL 환경변수로 분리 (배포 시 이 값만 교체):
//   로컬(기본): http://localhost:3000  → dev 서버(npm run dev)가 떠 있어야 함
//   배포:       EVIDENCE_API_URL=https://<vercel-도메인> node scripts/fetch-evidence.mjs ...
//
// 주의: 검색어는 영문이 PubMed 적중률이 높다. 한국어로 넣어도 동작은 하나 결과가 적을 수 있다.

const BASE = process.env.EVIDENCE_API_URL || 'http://localhost:3000'

const query = process.argv[2]
const context = process.argv[3] || 'blog'

if (!query) {
  console.error('사용법: node scripts/fetch-evidence.mjs "검색어" [blog|interaction]')
  process.exit(1)
}
if (context !== 'blog' && context !== 'interaction') {
  console.error("context는 'blog' 또는 'interaction'이어야 합니다.")
  process.exit(1)
}

function toMarkdown(summaryKo, results) {
  const lines = []
  lines.push('## 근거 (PubMed)')
  lines.push('')
  if (summaryKo) {
    lines.push(`> ${summaryKo}`)
    lines.push('')
  }
  // 논문별 한국어 요약 + 각주 마커
  results.forEach((r, i) => {
    const n = i + 1
    lines.push(`${n}. ${r.summary_ko || '(요약 없음)'} [^${n}]`)
  })
  lines.push('')
  // 각주 정의 (출처 링크)
  results.forEach((r, i) => {
    const n = i + 1
    const meta = [r.journal, r.year].filter(Boolean).join(', ')
    lines.push(`[^${n}]: [${r.title}](${r.url})${meta ? ` — ${meta}` : ''} (PMID ${r.pmid})`)
  })
  return lines.join('\n')
}

async function main() {
  const url = `${BASE}/api/evidence`
  let res
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, context }),
    })
  } catch (err) {
    console.error(`API 호출 실패 (${url}). dev 서버가 떠 있는지 확인하세요.`)
    console.error(String(err))
    process.exit(1)
  }

  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    console.error(`API 오류 [HTTP ${res.status}]: ${data.error || '알 수 없는 오류'}`)
    process.exit(1)
  }

  if (!data.results || data.results.length === 0) {
    console.error(`"${query}" 에 대한 근거를 찾지 못했습니다.`)
    process.exit(0)
  }

  // 진행 정보는 stderr로 (stdout은 순수 마크다운만)
  console.error(`✓ ${data.results.length}건 (${data.cached ? '캐시' : '신규 검색'})`)
  process.stdout.write(toMarkdown(data.summary_ko, data.results) + '\n')
}

main()
