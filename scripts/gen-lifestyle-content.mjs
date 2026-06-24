/**
 * 질환별 생활습관 "일반 정보" 콘텐츠 생성(저작 도구). 질환×토픽별로 PubMed 근거를 받아
 * Claude(안전 프레임 시스템 프롬프트)로 군 단위 일반 정보를 작성 → 금칙 프리체크 통과분만
 * lifestyle_content 테이블에 upsert(admin/service_role). 사용자 화면은 순수 SELECT.
 *
 * ⚠️ 안전 프레임의 canonical 정의는 src/lib/lifestyle-info/safety-frame.ts 다.
 *    아래 SYSTEM/FORBIDDEN은 그 스크립트판 사본(생성-시점 프리체크). 사용자 노출 직전엔
 *    앱이 같은 safety-frame.ts의 passesSafetyFrame()으로 최종 검증한다(권위 게이트).
 * 사전조건: 033_lifestyle_content.sql 적용 + .env.local 의 ANTHROPIC_API_KEY.
 * 실행: node scripts/gen-lifestyle-content.mjs [--dry]
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

const env = {}
readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8').split('\n').forEach(line => {
  const [k, ...v] = line.split('='); if (k && !k.startsWith('#')) env[k.trim()] = v.join('=').trim()
})
const DRY = process.argv.includes('--dry')
const supabase = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY'], { auth: { persistSession: false } })
const anthropic = new Anthropic({ apiKey: env['ANTHROPIC_API_KEY'] })
const MODEL = 'claude-sonnet-4-6'

// canonical: src/lib/lifestyle-info/safety-frame.ts (LIFESTYLE_SAFETY_SYSTEM)
const SAFETY_SYSTEM = [
  '당신은 만성질환 생활관리에 대한 "일반 정보"를 한국어로 정리하는 약사입니다. 의료행위가 아니라 정보 제공입니다.',
  '주어는 개인이 아니라 질환군입니다: "○○를 관리하는 분들께 일반적으로…" 형태. "당신은 ○○입니다" 같은 개인 진단 금지.',
  '개인 맞춤 지시·처방 금지: "하루 30분 걸으세요", "이걸 드세요" 금지. 복약 지시 금지: "약을 줄이세요" 금지.',
  '단정 금지: "반드시 ~해야 합니다", "위험합니다", "효과가 확실합니다" 금지.',
  '대신 정보형: "권장됩니다", "도움이 된다고 알려져 있습니다", "~라는 연구가 있습니다" 톤. 초록에 없는 내용 금지.',
  '2~3문장, 군 단위 일반 정보로만 작성. 마무리 상담 문구는 넣지 마세요(앱이 따로 붙입니다).',
].join('\n')

// canonical: safety-frame.ts FORBIDDEN_PATTERNS (사본)
const FORBIDDEN = [
  /당신은\s*[^.\n]*?(입니다|이에요|예요|있습니다|있으니|있어요)/,
  /(드세요|드십시오|먹으세요|걸으세요|운동하세요|줄이세요|늘리세요|중단하세요|복용하세요|하십시오)/,
  /(반드시|꼭)\s*[^.\n]*?(하세요|해야\s*합니다|드세요)/,
  /(위험합니다|위험해요|위독)/,
  /(효과가\s*확실|완치|치료됩니다|낫습니다|낫게\s*합니다)/,
  /(약을?\s*(줄이|끊|중단|늘리)|이\s*약\s*대신|복용을?\s*중단)/,
]
const passesSafety = (t) => !!t && !!t.trim() && !FORBIDDEN.some(re => re.test(t))

const EUTILS = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils'
const withKey = (u) => env['NCBI_API_KEY'] ? `${u}&api_key=${encodeURIComponent(env['NCBI_API_KEY'])}` : u

async function searchPubmed(query, retmax = 4) {
  try {
    const sr = await fetch(withKey(`${EUTILS}/esearch.fcgi?db=pubmed&retmode=json&sort=relevance&retmax=${retmax}&term=${encodeURIComponent(query)}`), { signal: AbortSignal.timeout(8000) })
    const ids = (await sr.json())?.esearchresult?.idlist ?? []
    if (!ids.length) return []
    const fr = await fetch(withKey(`${EUTILS}/efetch.fcgi?db=pubmed&rettype=abstract&retmode=xml&id=${ids.join(',')}`), { signal: AbortSignal.timeout(10000) })
    const xml = await fr.text()
    const out = []
    for (const m of xml.matchAll(/<PubmedArticle>([\s\S]*?)<\/PubmedArticle>/g)) {
      const b = m[1]
      const pmid = (b.match(/<PMID[^>]*>(\d+)<\/PMID>/) || [])[1] || ''
      const title = ((b.match(/<ArticleTitle>([\s\S]*?)<\/ArticleTitle>/) || [])[1] || '').replace(/<[^>]+>/g, '').trim()
      const abstract = [...b.matchAll(/<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/g)].map(x => x[1].replace(/<[^>]+>/g, '')).join(' ').trim()
      if (pmid) out.push({ pmid, title, abstract, url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` })
    }
    return out
  } catch { return [] }
}

async function writeBody(disease, topic, papers) {
  const user = `질환군: ${disease}\n주제: ${topic}\n\n아래 PubMed 초록들을 근거로, "${disease}를 관리하는 분들"에게 도움이 될 수 있는 ${topic} 관련 일반 정보를 2~3문장으로 작성하세요.\n\n` +
    papers.map((p, i) => `[논문 ${i + 1}] ${p.title}\n초록: ${p.abstract || '(없음)'}`).join('\n\n')
  const res = await anthropic.messages.create({
    model: MODEL, max_tokens: 600,
    system: SAFETY_SYSTEM,
    messages: [{ role: 'user', content: user }],
  })
  return res.content.filter(b => b.type === 'text').map(b => b.text).join('').trim()
}

const PLAN = [
  { disease: '당뇨', topics: [
    { topic: '식단', query: 'type 2 diabetes diet glycemic control nutrition' },
    { topic: '운동', query: 'type 2 diabetes physical activity exercise glycemic' },
    { topic: '생활습관', query: 'type 2 diabetes lifestyle modification management' },
  ]},
  { disease: '고혈압', topics: [
    { topic: '식단', query: 'hypertension dietary sodium DASH diet blood pressure' },
    { topic: '운동', query: 'hypertension aerobic exercise blood pressure reduction' },
    { topic: '생활습관', query: 'hypertension lifestyle modification weight alcohol' },
  ]},
  { disease: '고지혈증', topics: [
    { topic: '식단', query: 'dyslipidemia diet LDL cholesterol saturated fat' },
    { topic: '운동', query: 'dyslipidemia physical exercise lipid profile' },
    { topic: '생활습관', query: 'hyperlipidemia lifestyle modification management' },
  ]},
]

let ok = 0, skipped = 0
for (const { disease, topics } of PLAN) {
  for (const { topic, query } of topics) {
    const papers = await searchPubmed(query)
    if (!papers.length) { console.log(`  ⏭  ${disease}/${topic} — 논문 0건, 건너뜀`); skipped++; continue }
    const body = await writeBody(disease, topic, papers)
    if (!passesSafety(body)) { console.log(`  🚫 ${disease}/${topic} — 안전 프리체크 실패, 폐기`); skipped++; continue }
    const sources = papers.map(p => ({ pmid: p.pmid, url: p.url, title: p.title }))
    console.log(`  ✅ ${disease}/${topic} (${papers.length}편) — ${body.slice(0, 50)}…`)
    if (!DRY) {
      const { error } = await supabase.from('lifestyle_content')
        .upsert({ disease, topic, body_ko: body, sources, updated_at: new Date().toISOString() }, { onConflict: 'disease,topic' })
      if (error) { console.log(`     ⚠ upsert 실패: ${error.message}`); skipped++; continue }
    }
    ok++
  }
}
console.log(`\n완료: 적재 ${ok} · 건너뜀 ${skipped}${DRY ? ' (DRY)' : ''}`)
