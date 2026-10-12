/**
 * 일반의약품 바코드 ETL — 심평원 "약가마스터_의약품표준코드" CSV → drug_barcodes (1:N)
 *
 * 박스 바코드 = 의약품 표준코드(13자리 GTIN). CSV 한 행 = 품목 하나의 포장 단위 하나.
 * 연결 키는 **품목기준코드(= drugs.item_seq)** 다.
 *
 * 왜 바꿨나(2026-10-12): v1 은 제품코드(EDI 보험코드)로 drugs.edi_code 에 이었다.
 *   비급여 일반약은 EDI 가 없어서 대부분 빠졌고(일반약 13.3%), 대표 바코드 1개만 남겼다.
 *   TODO.md 는 이를 "유료 데이터 선행" 으로 적었지만 원인은 데이터가 아니라 연결 키였다.
 *   품목기준코드는 일반약 전 품목에 있다(약사로 상비약 2026-09-28 실측 15,069품목 100%).
 *
 * drugs 에 FK 를 걸지 않는다 — drugs 에 아직 없는 품목도 조회 시 resolveDrugIdByItemSeq 가
 * 허가정보로 만든다. 바코드는 조회 키일 뿐이고 약 정보는 여기서 싣지 않는다.
 *
 * 범위(1차): 전문일반구분='일반의약품' · 취소일자 없음. 측정은 전문약도 같이 보여 준다.
 *
 * 데이터: https://www.data.go.kr/data/15067462/fileData.do (EUC-KR CSV)
 * 사전조건: supabase/migrations/072_drug_barcodes.sql 적용.
 * 실행:
 *   node scripts/etl-drug-barcode.mjs "<csv경로>" --dry   쓰기 없이 측정만
 *   node scripts/etl-drug-barcode.mjs "<csv경로>"         drug_barcodes 적재
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'

const env = {}
readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8').split('\n').forEach(line => {
  const [k, ...v] = line.split('='); if (k && !k.startsWith('#')) env[k.trim()] = v.join('=').trim()
})
const supabase = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY'], { auth: { persistSession: false } })

const CSV = process.argv.slice(2).find(a => !a.startsWith('--'))
  || resolve(process.cwd(), '_barcode_tmp', '약가마스터_의약품표준코드.csv')
const DRY = process.argv.includes('--dry')

const ITEM_SEQ_RE = /^\d{9}$/
const GTIN13_RE   = /^\d{13}$/

// CSV 한 줄을 콤마로 분해(따옴표 필드 최소 대응 — 비고 열에 "한약재, 갈근" 같은 값이 있다)
function fields(line) {
  const out = []; let cur = '', q = false
  for (const ch of line) {
    if (ch === '"') q = !q
    else if (ch === ',' && !q) { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out.map(s => s.trim())   // 원본 값 끝에 공백이 붙어 있다('199905709 ')
}

// UTF-8 로 읽어서 깨지면(포털 원본은 EUC-KR) EUC-KR 로 다시 읽는다
function decode(buf) {
  const utf8 = new TextDecoder('utf-8').decode(buf)
  return utf8.includes('품목기준코드') ? utf8 : new TextDecoder('euc-kr').decode(buf)
}

function readCsv(path) {
  const lines = decode(readFileSync(path)).split(/\r?\n/).filter(Boolean)
  const head = fields(lines[0])
  const col = name => {
    const i = head.indexOf(name)
    if (i < 0) { console.error(`  ✗ 열 '${name}' 없음. 헤더:`, head); process.exit(1) }
    return i
  }
  const c = { seq: col('품목기준코드'), code: col('표준코드'), kind: col('전문일반구분'), cancel: col('취소일자') }
  return lines.slice(1).map(fields).map(f => ({
    seq: f[c.seq], code: f[c.code], kind: f[c.kind], canceled: !!f[c.cancel],
  }))
}

async function loadDrugs() {
  const bySeq = new Map()  // item_seq → { otc: '일반의약품'|'전문의약품'|…, canceled }
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('drugs')
      .select('item_seq,etc_otc_name,is_canceled').order('id').range(from, from + 999)
    if (error) throw new Error(error.message)
    if (!data?.length) break
    for (const d of data) if (d.item_seq) bySeq.set(d.item_seq, { otc: d.etc_otc_name, canceled: d.is_canceled })
    if (data.length < 1000) break
  }
  return bySeq
}

const pct = (a, b) => (b ? `${(a / b * 100).toFixed(1)}%` : '-')

async function main() {
  console.log('━━ 일반약 바코드 ETL (약가마스터 품목기준코드 → drug_barcodes) ━━')
  console.log(`  모드: ${DRY ? 'DRY RUN(측정만)' : 'UPSERT(적재)'}`)
  console.log(`  CSV : ${CSV}`)

  const rows = readCsv(CSV)
  // 구분별: 품목기준코드 → Set(표준코드)
  const byKind = { 일반의약품: new Map(), 전문의약품: new Map() }
  for (const r of rows) {
    const m = byKind[r.kind]
    if (!m || r.canceled || !ITEM_SEQ_RE.test(r.seq) || !GTIN13_RE.test(r.code)) continue
    if (!m.has(r.seq)) m.set(r.seq, new Set())
    m.get(r.seq).add(r.code)
  }

  const drugs = await loadDrugs()
  console.log(`  CSV 행 ${rows.length} · drugs ${drugs.size}건`)

  for (const [kind, m] of Object.entries(byKind)) {
    const codes = [...m.values()].reduce((n, s) => n + s.size, 0)
    // 의사결정 지표: drugs 의 정상 품목 중 바코드 1개 이상 보유 비율(TODO.md 13.3% 와 같은 분모)
    const live = [...drugs].filter(([, d]) => d.otc === kind && !d.canceled)
    const hit  = live.filter(([seq]) => m.has(seq)).length
    const csvOnly = [...m.keys()].filter(seq => !drugs.has(seq)).length
    console.log(`\n  [${kind}]`)
    console.log(`    CSV 품목 ${m.size} · 표준코드 ${codes}개 (품목당 ${(codes / (m.size || 1)).toFixed(2)})`)
    console.log(`    drugs 정상 품목 ${live.length} 중 바코드 보유 ${hit} (${pct(hit, live.length)})`)
    console.log(`    CSV 에만 있는 품목(drugs 미적재) ${csvOnly} — 조회 시 resolveDrugIdByItemSeq 가 생성`)
  }

  // 1차 적재 대상: 일반의약품. 한 바코드가 여러 품목에 걸리면 PK(barcode) 충돌 → 세어서 보고
  const otc = byKind['일반의약품']
  const owner = new Map()  // barcode → item_seq
  const conflicts = []
  for (const [seq, set] of otc) for (const code of set) {
    const prev = owner.get(code)
    if (prev && prev !== seq) conflicts.push([code, prev, seq])
    else owner.set(code, seq)
  }
  const etcCodes = new Set([...byKind['전문의약품'].values()].flatMap(s => [...s]))
  const crossKind = [...owner.keys()].filter(code => etcCodes.has(code)).length
  console.log(`\n  적재 대상 바코드 ${owner.size} · 품목 간 충돌 ${conflicts.length} · 전문약과 겹치는 바코드 ${crossKind}`)
  if (conflicts.length) console.log('    충돌 샘플:', conflicts.slice(0, 5))

  if (DRY) return

  const all = [...owner].map(([barcode, item_seq]) => ({ barcode, item_seq, source: 'hira_master' }))
  let done = 0
  for (let i = 0; i < all.length; i += 500) {
    const chunk = all.slice(i, i + 500)
    const { error } = await supabase.from('drug_barcodes').upsert(chunk, { onConflict: 'barcode' })
    if (error) throw new Error(error.message)
    done += chunk.length
    if (done % 10000 < 500 || done === all.length) console.log(`  upsert ${done}/${all.length}`)
  }
  console.log('✓ 완료')
}

main().catch(e => { console.error(e); process.exit(1) })
