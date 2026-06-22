/**
 * OTC 의약품 바코드 ETL — 심평원 "약가마스터_의약품표준코드" CSV → drugs.barcode
 *
 * 박스 바코드 = 의약품 표준코드(KD코드, 13자리 GTIN). CSV는 제품코드(EDI 보험코드) ↔
 * 의약품표준코드를 준다. 우리 drugs.edi_code(허가/심평원 ETL로 적재됨)로 브릿지한다:
 *   1) drugs 로드 → edi_code(콤마 다중) → drug 인덱스(ediToDrugs)
 *   2) CSV 순회 → 제품코드(EDI) → 표준코드(13자리)
 *   3) edi 매칭되는 drug.barcode = 표준코드 → 청크 upsert
 *
 * 한계: 약가마스터는 급여 의약품 위주 → 비급여 OTC는 누락 가능(검색 폴백이 흡수).
 *       하나의 EDI에 포장단위별 복수 표준코드가 있으면 대표 1개만 저장(v1).
 *       전수 1:N 매핑이 필요하면 별도 drug_barcodes 테이블로 승급(v2).
 *
 * 데이터: https://www.data.go.kr/data/15067462/fileData.do (CSV 다운로드)
 *   CSV가 EUC-KR이면 그대로 읽힘(아래 euc-kr 디코더). 헤더는 자동 탐지.
 * 사전조건: 027_barcode.sql 적용.
 * 실행:
 *   node scripts/etl-drug-barcode.mjs "<csv경로>"          실제 적재
 *   node scripts/etl-drug-barcode.mjs "<csv경로>" --dry     쓰기 없이 측정만
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'

const env = {}
readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8').split('\n').forEach(line => {
  const [k, ...v] = line.split('='); if (k && !k.startsWith('#')) env[k.trim()] = v.join('=').trim()
})
const supabase = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY'], { auth: { persistSession: false } })

const CSV = process.argv[2] || resolve(process.cwd(), '_barcode_tmp', '약가마스터_의약품표준코드.csv')
const DRY = process.argv.includes('--dry')

// CSV 한 줄을 콤마로 분해(따옴표 필드 최소 대응)
function fields(line) {
  const out = []; let cur = '', q = false
  for (const ch of line) {
    if (ch === '"') q = !q
    else if (ch === ',' && !q) { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out.map(s => s.trim().replace(/^"|"$/g, ''))
}

// 헤더에서 제품코드(EDI)·표준코드 열 인덱스 자동 탐지
function detectCols(header) {
  const idxOf = (...kw) => header.findIndex(h => kw.some(k => h.replace(/\s/g, '').includes(k)))
  const ediCol  = idxOf('제품코드', 'EDI', '약품코드', '청구코드', '보험코드')
  const codeCol = idxOf('표준코드', '바코드', 'KD코드', 'GTIN')
  return { ediCol, codeCol }
}

async function loadDrugs() {
  const ediToDrugs = new Map()  // EDI 보험코드 → [{id,item_seq,item_name}]
  let from = 0, n = 0, withEdi = 0
  for (;;) {
    const { data, error } = await supabase.from('drugs')
      .select('id,item_seq,item_name,edi_code').range(from, from + 999)
    if (error) throw new Error(error.message)
    if (!data?.length) break
    for (const d of data) {
      n++
      if (!d.edi_code) continue
      withEdi++
      for (const code of String(d.edi_code).split(',')) {
        const c = code.trim(); if (!c) continue
        if (!ediToDrugs.has(c)) ediToDrugs.set(c, [])
        ediToDrugs.get(c).push({ id: d.id, item_seq: d.item_seq, item_name: d.item_name })
      }
    }
    from += 1000
    if (data.length < 1000) break
  }
  return { ediToDrugs, n, withEdi }
}

async function main() {
  console.log('━━ OTC 바코드 ETL (약가마스터 표준코드 → drugs.barcode) ━━')
  console.log(`  모드: ${DRY ? 'DRY RUN(측정만)' : 'UPSERT(적재)'}`)
  console.log(`  CSV : ${CSV}`)

  const { ediToDrugs, n, withEdi } = await loadDrugs()
  console.log(`  drugs ${n}건 (edi_code 보유 ${withEdi} / 고유 보험코드 ${ediToDrugs.size})`)

  const raw   = readFileSync(CSV)
  const text  = new TextDecoder('euc-kr').decode(raw)   // 한글 공공 CSV 기본 인코딩
  const lines = text.split(/\r?\n/)
  const { ediCol, codeCol } = detectCols(fields(lines[0]))
  if (ediCol < 0 || codeCol < 0) {
    console.error(`  ✗ 열 탐지 실패 (제품코드=${ediCol}, 표준코드=${codeCol}). 헤더:`, fields(lines[0]))
    process.exit(1)
  }
  console.log(`  열: 제품코드[${ediCol}] · 표준코드[${codeCol}]`)

  const byId = new Map()  // drug id → barcode (첫 매칭 우선, 덮어쓰기 churn 방지)
  let rows = 0, matchedRows = 0
  for (let i = 1; i < lines.length; i++) {
    const f = fields(lines[i]); if (f.length <= Math.max(ediCol, codeCol)) continue
    const edi  = f[ediCol]?.trim()
    const code = f[codeCol]?.replace(/\D/g, '')           // 숫자만 (13자리 GTIN)
    if (!edi || !code || code.length < 8) continue
    rows++
    const drugs = ediToDrugs.get(edi); if (!drugs) continue
    matchedRows++
    for (const d of drugs) if (!byId.has(d.id)) byId.set(d.id, { ...d, barcode: code })
  }
  console.log(`  CSV 유효행 ${rows} · EDI 매칭행 ${matchedRows} · 바코드 부여 drug ${byId.size}건`)

  if (DRY) {
    console.log('  (DRY) 샘플:', [...byId.values()].slice(0, 5).map(d => `${d.item_name}=${d.barcode}`))
    return
  }

  const all = [...byId.values()]
  let done = 0
  for (let i = 0; i < all.length; i += 500) {
    const chunk = all.slice(i, i + 500)
      .map(d => ({ id: d.id, item_seq: d.item_seq, item_name: d.item_name, barcode: d.barcode }))
    const { error } = await supabase.from('drugs').upsert(chunk, { onConflict: 'id' })
    if (error) throw new Error(error.message)
    done += chunk.length
    console.log(`  upsert ${done}/${all.length}`)
  }
  console.log('✓ 완료')
}

main().catch(e => { console.error(e); process.exit(1) })
