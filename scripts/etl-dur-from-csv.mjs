/**
 * DUR 병용금기 — 심평원 "DUR 의약품 목록" CSV 기반 적재
 *
 * 배경: 우리 drugs는 식약처 item_seq 키. CSV(심평원 병용금기 품목리스트)는
 *  제품코드(보험/EDI)·성분코드(심평원)로 식별 → 코드 체계가 달라 직접 조인 불가.
 *  따라서 제품명(정규화) 매칭으로 우리 drugs ↔ CSV 제품을 연결한다.
 *
 * 2가지 모드:
 *   (기본) DRY RUN  — 매칭 수율만 측정(쓰기 없음).
 *   UPSERT=1        — interactions 테이블에 실제 적재.
 *
 * CSV 컬럼(병용금기): 성분명A,성분코드A,제품코드A,제품명A,업체명A,급여여부A,
 *                      성분명B,성분코드B,제품코드B,제품명B,업체명B,급여여부B,
 *                      고시번호,고시일자,상세정보,비고
 *
 * 실행: node scripts/etl-dur-from-csv.mjs "<csv경로>"
 *       UPSERT=1 node scripts/etl-dur-from-csv.mjs "<csv경로>"
 */
import { createReadStream, readFileSync } from 'fs'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'

// ── env ──
const env = {}
readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8').split('\n').forEach(line => {
  const [k, ...v] = line.split('=')
  if (k && !k.startsWith('#')) env[k.trim()] = v.join('=').trim()
})
const supabase = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY'], { auth: { persistSession: false } })

const CSV = process.argv[2] || resolve(process.cwd(), '_dur_csv_tmp', '의약품안전사용서비스(DUR)_병용금기 품목리스트 2025.6.csv')
const UPSERT = process.env.UPSERT === '1'

// ── 제품명 정규화 ──
// full  : "_(포장)" 제거 + 공백/구두점 제거 + 소문자  (성분 괄호는 유지)
// base  : full 에서 첫 '(' 이후 제거 (성분/염 표기 차이 흡수 — 더 느슨)
function full(name) {
  if (!name) return ''
  return String(name).split('_(')[0].replace(/[\s]/g, '').replace(/[“”"']/g, '').toLowerCase()
}
function base(name) {
  return full(name).replace(/\(.*$/, '')
}

async function loadDrugs() {
  const byFull = new Map()   // full(name) → Set(id)
  const byBase = new Map()   // base(name) → Set(id)
  let from = 0, n = 0
  for (;;) {
    const { data, error } = await supabase.from('drugs').select('id,item_name').range(from, from + 999)
    if (error) throw new Error(error.message)
    if (!data?.length) break
    for (const d of data) {
      n++
      const f = full(d.item_name), b = base(d.item_name)
      if (f) { if (!byFull.has(f)) byFull.set(f, new Set()); byFull.get(f).add(d.id) }
      if (b) { if (!byBase.has(b)) byBase.set(b, new Set()); byBase.get(b).add(d.id) }
    }
    from += 1000
    if (data.length < 1000) break
  }
  return { byFull, byBase, n }
}

// CSV 한 줄 → 필드 배열 (필요 필드 0~13은 따옴표 없는 단순 콤마 split로 충분; 14 상세정보만 따옴표)
function fields(line) { return line.split(',') }

function lookup(name, byFull, byBase) {
  const f = full(name)
  if (byFull.has(f)) return { ids: byFull.get(f), how: 'full' }
  const b = base(name)
  if (byBase.has(b)) return { ids: byBase.get(b), how: 'base' }
  return null
}

async function main() {
  console.log('━━ DUR 병용금기 CSV 적재 ━━')
  console.log(`  CSV: ${CSV}`)
  console.log(`  모드: ${UPSERT ? 'UPSERT(실제 적재)' : 'DRY RUN(측정만)'}`)
  const { byFull, byBase, n } = await loadDrugs()
  console.log(`  drugs ${n}건 로딩 (full키 ${byFull.size} / base키 ${byBase.size})`)

  // ── 1차: CSV 순회 — 제품명→성분코드 맵 + 고유 성분쌍(심평원 코드) 수집 ──
  const prodToIngr = new Map()   // full/base(제품명) → 성분코드(심평원)
  const ingrPairs = new Map()    // "ingrA|ingrB"(정렬) → 설명
  const ingrName = new Map()     // 성분코드 → 성분명
  let rows = 0, header = true

  const decoder = new TextDecoder('euc-kr')
  let buf = ''
  const stream = createReadStream(CSV)
  const handle = (line) => {
    if (header) { header = false; return }
    if (!line.trim()) return
    rows++
    const c = fields(line)
    if (c.length < 12) return
    const nameA = c[3], codeA = c[1], inA = c[0]
    const nameB = c[9], codeB = c[7], inB = c[6]
    const detail = (c[14] || '').replace(/^"|"$/g, '')
    if (codeA) { prodToIngr.set(full(nameA), codeA); if (!prodToIngr.has(base(nameA))) prodToIngr.set(base(nameA), codeA); ingrName.set(codeA, inA) }
    if (codeB) { prodToIngr.set(full(nameB), codeB); if (!prodToIngr.has(base(nameB))) prodToIngr.set(base(nameB), codeB); ingrName.set(codeB, inB) }
    if (codeA && codeB && codeA !== codeB) {
      const [x, y] = codeA < codeB ? [codeA, codeB] : [codeB, codeA]
      const key = `${x}|${y}`
      if (!ingrPairs.has(key)) ingrPairs.set(key, [inA, inB].filter(Boolean).join(' ↔ ') || detail.slice(0, 300) || null)
    }
  }
  for await (const chunk of stream) {
    buf += decoder.decode(chunk, { stream: true })
    let idx
    while ((idx = buf.indexOf('\n')) >= 0) {
      handle(buf.slice(0, idx).replace(/\r$/, ''))
      buf = buf.slice(idx + 1)
    }
  }
  buf += decoder.decode()
  if (buf) handle(buf)

  // ── 2차: 우리 drugs에 심평원 성분코드 부여(제품명 매칭) → ingrCode → [drugId] 인덱스 ──
  const ingrToDrugs = new Map()  // 성분코드 → Set(drugId)
  let assigned = 0
  for (const [f, ids] of byFull) {
    const code = prodToIngr.get(f)
    if (!code) continue
    for (const id of ids) { if (!ingrToDrugs.has(code)) ingrToDrugs.set(code, new Set()); ingrToDrugs.get(code).add(id); }
    assigned += ids.size
  }
  // base 키로 보강(full 미스만)
  for (const [b, ids] of byBase) {
    const code = prodToIngr.get(b)
    if (!code) continue
    for (const id of ids) { if (!ingrToDrugs.has(code)) ingrToDrugs.set(code, new Set()); ingrToDrugs.get(code).add(id) }
  }
  const drugsWithCode = new Set()
  for (const ids of ingrToDrugs.values()) ids.forEach(id => drugsWithCode.add(id))

  // ── 3차: 성분쌍 교차곱 → interactions 쌍 ──
  const pairKeys = new Set()
  const pairDesc = new Map()
  for (const [pk, desc] of ingrPairs) {
    const [ca, cb] = pk.split('|')
    const A = ingrToDrugs.get(ca), B = ingrToDrugs.get(cb)
    if (!A || !B) continue
    for (const a of A) for (const b of B) {
      if (a === b) continue
      const [x, y] = a < b ? [a, b] : [b, a]
      const key = `${x}|${y}`
      if (!pairKeys.has(key)) { pairKeys.add(key); pairDesc.set(key, desc) }
    }
  }

  console.log(`\n  CSV 행: ${rows.toLocaleString()}`)
  console.log(`  고유 성분쌍(심평원): ${ingrPairs.size.toLocaleString()}`)
  console.log(`  성분코드 부여된 우리 drugs: ${drugsWithCode.size} / ${n}`)
  console.log(`  ★ 생성 가능한 고유 interactions 쌍: ${pairKeys.size.toLocaleString()}`)

  if (!UPSERT) {
    console.log('\n  (DRY RUN — 적재하지 않음. 적재하려면 UPSERT=1)')
    return
  }

  // 실제 적재
  const all = [...pairKeys].map(key => {
    const [drug_a_id, drug_b_id] = key.split('|')
    return { drug_a_id, drug_b_id, severity: 'contraindicated', description: pairDesc.get(key), source: 'dur_api', updated_at: new Date().toISOString() }
  })
  const CHUNK = 500
  let up = 0
  for (let i = 0; i < all.length; i += CHUNK) {
    const { error } = await supabase.from('interactions').upsert(all.slice(i, i + CHUNK), { onConflict: 'drug_a_id,drug_b_id', ignoreDuplicates: true })
    if (error) throw new Error(`interactions upsert: ${error.message}`)
    up += Math.min(CHUNK, all.length - i)
    process.stdout.write(`\r  적재 ${up}/${all.length}   `)
  }
  console.log(`\n  ✅ 완료. interactions 쌍 ${all.length.toLocaleString()}건 upsert`)
}

main().catch(e => { console.error('\n에러:', e.message); process.exit(1) })
