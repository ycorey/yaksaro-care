/**
 * 블로그용 의약품 성분·함량 조회 (온디맨드, DB 불필요)
 *
 * 제품명 → 식약처 허가목록에서 품목코드 확인 → 의약품안전나라 상세에서
 * "원료약품 및 분량"(한글 성분명·분량·단위)을 파싱해 정리 출력.
 * /blog · /seoblog 작성 시 성분 비교표·함량 근거 확보용.
 *
 * 실행:
 *   node scripts/blog-drug-lookup.mjs "닥터베아제정"
 *   node scripts/blog-drug-lookup.mjs "닥터베아제정" "훼스탈플러스정" "다제스캡슐"
 *   node scripts/blog-drug-lookup.mjs --json "타이레놀정500밀리그람"
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'

const env = {}
readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8').split('\n').forEach(line => {
  const [k, ...v] = line.split('='); if (k && !k.startsWith('#')) env[k.trim()] = v.join('=').trim()
})
const KEY = encodeURIComponent(env['MFDS_DRUG_LICENSE_KEY'])
const BASE = 'https://apis.data.go.kr'

const args = process.argv.slice(2)
const JSON_OUT = args.includes('--json')
const names = args.filter(a => a !== '--json')

// ── 1) 제품명 → 품목 메타(item_seq, 정식명, 제조사, 전문/일반) ──
async function findItem(name) {
  const url = `${BASE}/1471000/DrugPrdtPrmsnInfoService07/getDrugPrdtPrmsnInq07`
    + `?serviceKey=${KEY}&item_name=${encodeURIComponent(name)}&numOfRows=10&pageNo=1&type=json`
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
  const json = JSON.parse(await res.text())
  const raw = json?.body?.items
  const arr = Array.isArray(raw) ? raw : (raw ? [raw] : [])
  const valid = arr.filter(i => i.ITEM_SEQ && i.ITEM_NAME && (!i.CANCEL_NAME || i.CANCEL_NAME === '정상'))
  if (valid.length === 0) return null
  // 정확 일치 우선, 없으면 첫 정상 품목
  const exact = valid.find(i => i.ITEM_NAME === name) || valid.find(i => i.ITEM_NAME.startsWith(name))
  const it = exact || valid[0]
  return {
    item_seq: String(it.ITEM_SEQ),
    item_name: it.ITEM_NAME,
    entp_name: it.ENTP_NAME || null,
    class_type: it.SPCLTY_PBLC || null,
    candidates: valid.map(i => i.ITEM_NAME),
  }
}

// ── 2) item_seq → 원료약품 및 분량 (한글 성분명·분량·단위) ──
async function fetchIngredients(itemSeq) {
  const url = `https://nedrug.mfds.go.kr/pbp/CCBBB01/getItemDetailCache?cacheSeq=${itemSeq}&leftMenuState=Y`
  const res = await fetch(url, { signal: AbortSignal.timeout(12000) })
  const html = await res.text()

  // 원료약품 표는 효능효과(_ee_doc) 앞에 위치 → 그 앞으로 한정
  const end = html.indexOf('id="_ee_doc"')
  const scope = end > 0 ? html.slice(0, end) : html

  // 행 패턴: <td center>순번</td><td left>성분명</td><td center>분량</td><td center>단위</td>
  const rowRe = /<td[^>]*>\s*(\d+)\s*<\/td>\s*<td[^>]*text-align:\s*left[^>]*>\s*([^<]+?)\s*<\/td>\s*<td[^>]*>\s*([\d.]+)\s*<\/td>\s*<td[^>]*>\s*([^<]+?)\s*<\/td>/g
  const out = []
  const seen = new Set()
  let m
  while ((m = rowRe.exec(scope)) !== null) {
    const name = m[2].replace(/&middot;/g, '·').replace(/&amp;/g, '&').trim()
    const amount = m[3]
    const unit = m[4].trim()
    // 다층정 등 제법 그룹별 동일 성분 중복 제거: 표기 정규화(Ⅱ→II 등)+분량+단위 기준
    const key = `${name.normalize('NFKC').replace(/\s+/g, '')}|${amount}|${unit}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ seq: out.length + 1, name, amount, unit })
  }
  return out
}

async function lookup(name) {
  const meta = await findItem(name)
  if (!meta) return { query: name, error: '허가목록에서 제품을 찾지 못함' }
  const ingredients = await fetchIngredients(meta.item_seq)
  return { query: name, ...meta, ingredients }
}

const results = []
for (const n of names) {
  try { results.push(await lookup(n)) }
  catch (e) { results.push({ query: n, error: e.message }) }
  await new Promise(r => setTimeout(r, 300))
}

if (JSON_OUT) {
  console.log(JSON.stringify(results, null, 2))
} else {
  for (const r of results) {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    if (r.error) { console.log(`❌ ${r.query}: ${r.error}`); continue }
    console.log(`💊 ${r.item_name}  (${r.entp_name ?? '-'} · ${r.class_type ?? '-'} · 품목 ${r.item_seq})`)
    if (r.candidates && r.candidates.length > 1) console.log(`   후보: ${r.candidates.slice(0, 5).join(' / ')}`)
    if (!r.ingredients.length) { console.log('   ⚠️ 원료·분량 파싱 0건 (수동 확인 필요)'); continue }
    console.log('   ── 원료약품 및 분량 (식약처 허가) ──')
    for (const g of r.ingredients) console.log(`   ${String(g.seq).padStart(2)}. ${g.name}  ${g.amount} ${g.unit}`)
  }
}
