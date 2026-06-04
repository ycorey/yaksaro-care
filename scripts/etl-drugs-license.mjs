/**
 * 약 마스터 확장 — 식약처 의약품 제품 허가정보(getDrugPrdtPrmsnInq07) 전체 적재
 *
 * 기존 drugs는 e약은요(소비자약 ~4,795)만 → 허가정보(~43,224)로 확장한다.
 * 효과: OCR 약품 인식·검색 자동완성·DUR 성분 매칭의 커버리지가 크게 향상.
 *
 * 보존 규칙(중요):
 *   · ingredient_code(식약처 DUR D-code, 기존 606건)는 payload에서 OMIT → 업데이트 시 보존.
 *   · image_url(008 lazy-cache)도 OMIT → 보존(허가정보 BIG_PRDT_IMG_URL은 008 경로가 채움).
 *   배치 upsert는 payload에 있는 컬럼만 SET하므로, 빼두면 기존 값이 유지된다.
 *
 * 사전조건: 016_drugs_edi_and_status.sql 실행(edi_code/is_canceled 컬럼).
 * 실행: node scripts/etl-drugs-license.mjs
 *       MAX_PAGES=5 node scripts/etl-drugs-license.mjs   (검증용)
 */
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'

const env = {}
readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8').split('\n').forEach(line => {
  const [k, ...v] = line.split('='); if (k && !k.startsWith('#')) env[k.trim()] = v.join('=').trim()
})
const supabase = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY'], { auth: { persistSession: false } })
const KEY = encodeURIComponent(env['MFDS_DRUG_LICENSE_KEY'])
const BASE = 'https://apis.data.go.kr'
const ROWS = 100
const DELAY = Number(env['LICENSE_DELAY'] ?? 120)
const MAX_PAGES = process.env.MAX_PAGES ? Number(process.env.MAX_PAGES) : Infinity
const CP = resolve(process.cwd(), '.etl-drugs-license-checkpoint.json')

const sleep = ms => new Promise(r => setTimeout(r, ms))
const toArr = v => Array.isArray(v) ? v : v ? [v] : []
const otc = s => (s === '전문의약품' || s === '일반의약품') ? s : null

async function fetchJson(url, attempt = 0) {
  let res
  try { res = await fetch(url) }
  catch (e) { if (attempt < 6) { await sleep(2000 * (attempt + 1)); return fetchJson(url, attempt + 1) } throw e }
  if (res.status === 429 || res.status >= 500) {
    if (attempt < 7) { const w = 2500 * (attempt + 1); process.stdout.write(`\r  ⏳ HTTP ${res.status} — ${w / 1000}s 대기 후 재시도(${attempt + 1})        `); await sleep(w); return fetchJson(url, attempt + 1) }
    throw new Error(`HTTP ${res.status} (재시도 초과)`)
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const text = await res.text()
  if (text.includes('LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS')) throw new Error('일일 호출한도 초과(LIMIT)')
  if (text.includes('SERVICE_KEY_IS_NOT_REGISTERED')) throw new Error('API 키 미등록')
  try { return JSON.parse(text) } catch { throw new Error(`JSON 파싱 실패: ${text.slice(0, 160)}`) }
}

async function main() {
  console.log('━━ 약 마스터 확장 — 허가정보 ETL ━━')
  let page = 1, total = 0, upserted = 0
  if (existsSync(CP)) { const c = JSON.parse(readFileSync(CP, 'utf-8')); page = c.page + 1; upserted = c.upserted || 0; console.log(`  체크포인트 복원 → ${c.page}p 완료, ${page}부터 재개`) }

  for (;;) {
    if (page > MAX_PAGES) { console.log(`\n  MAX_PAGES(${MAX_PAGES}) 도달 — 중단`); break }
    const url = `${BASE}/1471000/DrugPrdtPrmsnInfoService07/getDrugPrdtPrmsnInq07?serviceKey=${KEY}&numOfRows=${ROWS}&pageNo=${page}&type=json`
    const json = await fetchJson(url)
    const body = json?.body
    if (!body) throw new Error('응답 body 없음: ' + JSON.stringify(json).slice(0, 160))
    if (total === 0) { total = Number(body.totalCount) || 0; if (page === 1) console.log(`  총 ${total.toLocaleString()}건`) }

    const items = toArr(body.items)
    if (items.length === 0) break

    const seen = new Set()
    const rows = items
      .filter(i => i.ITEM_SEQ && i.ITEM_NAME && !seen.has(String(i.ITEM_SEQ)) && seen.add(String(i.ITEM_SEQ)))
      .map(i => ({
        item_seq:        String(i.ITEM_SEQ),
        item_name:       String(i.ITEM_NAME),
        entp_name:       i.ENTP_NAME || null,
        ingredient_name: i.ITEM_INGR_NAME || null,
        etc_otc_name:    otc(i.SPCLTY_PBLC),
        form_code_name:  i.PRDUCT_TYPE || null,
        edi_code:        i.EDI_CODE || null,
        is_canceled:     !!(i.CANCEL_NAME && i.CANCEL_NAME !== '정상'),
        updated_at:      new Date().toISOString(),
        // ingredient_code, image_url 은 의도적으로 OMIT → 기존 값 보존
      }))

    if (rows.length) {
      const { error } = await supabase.from('drugs').upsert(rows, { onConflict: 'item_seq' })
      if (error) throw new Error(`drugs upsert: ${error.message}`)
      upserted += rows.length
    }

    const maxPage = Math.ceil(total / ROWS)
    process.stdout.write(`\r  ${page}/${maxPage} | upsert ${upserted.toLocaleString()}        `)
    writeFileSync(CP, JSON.stringify({ page, upserted }))

    if (page >= maxPage || items.length < ROWS) break
    page++; await sleep(DELAY)
  }

  if (existsSync(CP)) unlinkSync(CP)
  console.log(`\n  ✅ 완료. drugs upsert ${upserted.toLocaleString()}건 (item_seq 기준)`)
}

main().catch(e => { console.error('\n에러:', e.message); process.exit(1) })
