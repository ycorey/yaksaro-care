/**
 * DUR 병용금기 — 심평원 "DUR 의약품 목록" CSV 기반 적재 (EDI 보험코드 브릿지)
 *
 * 우리 drugs는 식약처 item_seq 키. CSV(심평원)는 제품코드(보험/EDI)·성분코드(심평원)로 식별.
 * 허가정보 ETL로 drugs.edi_code(보험코드)가 채워지면, EDI로 정확 매칭이 가능해진다:
 *   1) drugs.edi_code(콤마 다중) → 각 코드별 drug 인덱스(ediToDrugs)
 *   2) CSV에서 제품코드→성분코드(심평원) 학습 → 우리 drugs에 심평원 성분코드 부여
 *   3) CSV 고유 성분쌍 × 우리 drugs(성분별) 교차곱 → interactions
 *   (+ 제품단위 EDI 직접 매칭도 병행)
 *
 * 모드: 기본 DRY RUN(측정만) / UPSERT=1 시 interactions 적재.
 * 실행: node scripts/etl-dur-from-csv.mjs ["<csv경로>"]
 */
import { createReadStream, readFileSync } from 'fs'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'

const env = {}
readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8').split('\n').forEach(line => {
  const [k, ...v] = line.split('='); if (k && !k.startsWith('#')) env[k.trim()] = v.join('=').trim()
})
const supabase = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY'], { auth: { persistSession: false } })
const CSV = process.argv[2] || resolve(process.cwd(), '_dur_csv_tmp', '의약품안전사용서비스(DUR)_병용금기 품목리스트 2025.6.csv')
const UPSERT = process.env.UPSERT === '1'

function full(name) { return name ? String(name).split('_(')[0].replace(/\s/g, '').replace(/[“”"']/g, '').toLowerCase() : '' }
function base(name) { return full(name).replace(/\(.*$/, '') }
const fields = line => line.split(',')

async function loadDrugs() {
  const ediToDrugs = new Map()  // 보험코드 → Set(id)
  const byFull = new Map(), byBase = new Map()
  let from = 0, n = 0, withEdi = 0
  for (;;) {
    const { data, error } = await supabase.from('drugs').select('id,item_name,edi_code').range(from, from + 999)
    if (error) throw new Error(error.message)
    if (!data?.length) break
    for (const d of data) {
      n++
      if (d.edi_code) {
        withEdi++
        for (const code of String(d.edi_code).split(',')) {
          const c = code.trim(); if (!c) continue
          if (!ediToDrugs.has(c)) ediToDrugs.set(c, new Set()); ediToDrugs.get(c).add(d.id)
        }
      }
      const f = full(d.item_name), b = base(d.item_name)
      if (f) { if (!byFull.has(f)) byFull.set(f, new Set()); byFull.get(f).add(d.id) }
      if (b) { if (!byBase.has(b)) byBase.set(b, new Set()); byBase.get(b).add(d.id) }
    }
    from += 1000
    if (data.length < 1000) break
  }
  return { ediToDrugs, byFull, byBase, n, withEdi }
}

async function main() {
  console.log('━━ DUR 병용금기 CSV 적재 (EDI 브릿지) ━━')
  console.log(`  모드: ${UPSERT ? 'UPSERT(적재)' : 'DRY RUN(측정만)'}`)
  const { ediToDrugs, byFull, byBase, n, withEdi } = await loadDrugs()
  console.log(`  drugs ${n}건 (edi_code 보유 ${withEdi} / 고유 보험코드 ${ediToDrugs.size})`)

  // 1차: CSV 순회 — EDI/제품명 → 성분코드(심평원), 고유 성분쌍, 제품쌍(EDI)
  const ediToIngr = new Map()       // 보험코드 → 성분코드
  const prodToIngr = new Map()      // full/base(제품명) → 성분코드 (EDI 미스 fallback)
  const ingrPairs = new Map()       // "ingrA|ingrB" → 설명
  const prodPairs = []              // [ediA, ediB] (제품단위 직접 매칭용)
  let rows = 0, header = true

  const decoder = new TextDecoder('euc-kr')
  let buf = ''
  const handle = (line) => {
    if (header) { header = false; return }
    if (!line.trim()) return
    rows++
    const c = fields(line); if (c.length < 12) return
    const inA = c[0], codeA = c[1], ediA = (c[2] || '').trim(), nameA = c[3]
    const inB = c[6], codeB = c[7], ediB = (c[8] || '').trim(), nameB = c[9]
    const detail = (c[14] || '').replace(/^"|"$/g, '')
    if (codeA) { if (ediA) ediToIngr.set(ediA, codeA); prodToIngr.set(full(nameA), codeA); if (!prodToIngr.has(base(nameA))) prodToIngr.set(base(nameA), codeA) }
    if (codeB) { if (ediB) ediToIngr.set(ediB, codeB); prodToIngr.set(full(nameB), codeB); if (!prodToIngr.has(base(nameB))) prodToIngr.set(base(nameB), codeB) }
    if (codeA && codeB && codeA !== codeB) {
      const [x, y] = codeA < codeB ? [codeA, codeB] : [codeB, codeA]
      const key = `${x}|${y}`
      if (!ingrPairs.has(key)) ingrPairs.set(key, [inA, inB].filter(Boolean).join(' ↔ ') || detail.slice(0, 300) || null)
    }
    if (ediA && ediB) prodPairs.push([ediA, ediB])
  }
  const stream = createReadStream(CSV)
  for await (const chunk of stream) {
    buf += decoder.decode(chunk, { stream: true })
    let idx
    while ((idx = buf.indexOf('\n')) >= 0) { handle(buf.slice(0, idx).replace(/\r$/, '')); buf = buf.slice(idx + 1) }
  }
  buf += decoder.decode(); if (buf) handle(buf)

  // 2차: 우리 drugs에 심평원 성분코드 부여 — EDI 우선, 이름 fallback
  const ingrToDrugs = new Map()     // 성분코드 → Set(drugId)
  const drugIngr = new Map()        // drugId → 성분코드
  const addIngr = (id, code) => {
    if (!code) return
    drugIngr.set(id, code)
    if (!ingrToDrugs.has(code)) ingrToDrugs.set(code, new Set()); ingrToDrugs.get(code).add(id)
  }
  for (const [edi, ids] of ediToDrugs) { const code = ediToIngr.get(edi); if (code) ids.forEach(id => addIngr(id, code)) }
  // 이름 fallback (EDI 미부여만)
  for (const [, idx] of [['full', byFull], ['base', byBase]]) {
    for (const [name, ids] of idx) { const code = prodToIngr.get(name); if (code) ids.forEach(id => { if (!drugIngr.has(id)) addIngr(id, code) }) }
  }
  const drugsWithCode = drugIngr.size

  // 3차: 성분쌍 교차곱 → interactions
  const pairKeys = new Set(), pairDesc = new Map()
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
  // 제품단위 EDI 직접 매칭(보강)
  let prodLevel = 0
  for (const [ediA, ediB] of prodPairs) {
    const A = ediToDrugs.get(ediA), B = ediToDrugs.get(ediB)
    if (!A || !B) continue
    for (const a of A) for (const b of B) {
      if (a === b) continue
      const [x, y] = a < b ? [a, b] : [b, a]
      const key = `${x}|${y}`
      if (!pairKeys.has(key)) { pairKeys.add(key); pairDesc.set(key, null); prodLevel++ }
    }
  }

  console.log(`\n  CSV 행: ${rows.toLocaleString()} / 고유 성분쌍 ${ingrPairs.size.toLocaleString()}`)
  console.log(`  성분코드 부여된 우리 drugs: ${drugsWithCode} / ${n}`)
  console.log(`  ★ 생성 가능한 고유 interactions 쌍: ${pairKeys.size.toLocaleString()} (제품단위 추가분 ${prodLevel})`)

  if (!UPSERT) { console.log('\n  (DRY RUN — 적재하려면 UPSERT=1)'); return }

  const all = [...pairKeys].map(key => { const [drug_a_id, drug_b_id] = key.split('|'); return { drug_a_id, drug_b_id, severity: 'contraindicated', description: pairDesc.get(key), source: 'dur_api', updated_at: new Date().toISOString() } })
  const CHUNK = 500; let up = 0
  for (let i = 0; i < all.length; i += CHUNK) {
    const { error } = await supabase.from('interactions').upsert(all.slice(i, i + CHUNK), { onConflict: 'drug_a_id,drug_b_id', ignoreDuplicates: true })
    if (error) throw new Error(`interactions upsert: ${error.message}`)
    up += Math.min(CHUNK, all.length - i); process.stdout.write(`\r  적재 ${up}/${all.length}   `)
  }
  console.log(`\n  ✅ 완료. interactions 쌍 ${all.length.toLocaleString()}건 upsert`)
}
main().catch(e => { console.error('\n에러:', e.message); process.exit(1) })
