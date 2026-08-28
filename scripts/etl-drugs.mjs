/**
 * 약사로 케어 — 식약처 공공API → Supabase ETL 배치
 *
 * 실행: node scripts/etl-drugs.mjs [--drugs] [--supplements] [--dur]
 *       플래그 없으면 전체 실행
 *
 * 순서:
 *   Phase 1: e약은요        → drugs 테이블
 *   Phase 2: 건강기능식품    → supplements 테이블
 *   Phase 3: DUR 병용금기   → interactions 테이블 (+ drugs.ingredient_code 업데이트)
 */

// writeFileSync/existsSync/unlinkSync 는 DUR 단계의 체크포인트용이었다 — 그 단계가
// 동결되면서 함께 빠졌다(다른 단계는 체크포인트를 쓰지 않는다).
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'

// ── 환경변수 파싱 ──────────────────────────────────────────────────
const envPath = resolve(process.cwd(), '.env.local')
const env = {}
readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
  const [key, ...vals] = line.split('=')
  if (key && !key.startsWith('#')) env[key.trim()] = vals.join('=').trim()
})

const supabase = createClient(
  env['NEXT_PUBLIC_SUPABASE_URL'],
  env['SUPABASE_SERVICE_ROLE_KEY'],
  { auth: { persistSession: false } }
)

const KEY   = encodeURIComponent(env['MFDS_EASY_DRUG_KEY'])       // drugs + DUR
const HKEY  = encodeURIComponent(env['MFDS_HEALTH_FOOD_KEY'])     // 건기식

const BASE  = 'https://apis.data.go.kr'
const ROWS  = 100   // 페이지 당 레코드 수
const DELAY = 250   // API 호출 간 ms

// ── 유틸 ──────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms))

function bar(label, page, maxPage, count) {
  process.stdout.write(`\r  ${label} | ${page}/${maxPage} 페이지 | ${count.toLocaleString()}건`)
}

async function fetchJson(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const text = await res.text()

  if (text.includes('SERVICE_KEY_IS_NOT_REGISTERED_ERROR')) throw new Error('API 키 미등록')
  if (text.includes('LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR')) throw new Error('일일 호출 한도 초과')
  if (text.includes('INVALID_REQUEST_PARAMETER_ERROR')) throw new Error('요청 파라미터 오류')

  try { return JSON.parse(text) }
  catch { throw new Error(`JSON 파싱 실패: ${text.slice(0, 200)}`) }
}

// 배열이 아닌 단일 객체도 배열로 정규화 (공공API 1건일 때 배열 아님)
const toArr = v => (Array.isArray(v) ? v : v ? [v] : [])

// ── Phase 1: 의약품 (e약은요) ──────────────────────────────────────
async function etlDrugs() {
  console.log('\n━━ [Phase 1] e약은요 → drugs ━━')
  let page = 1, total = 0, inserted = 0

  while (true) {
    const url = `${BASE}/1471000/DrbEasyDrugInfoService/getDrbEasyDrugList`
      + `?serviceKey=${KEY}&numOfRows=${ROWS}&pageNo=${page}&type=json`

    const json = await fetchJson(url)
    const body = json?.body
    if (!body) throw new Error('응답 body 없음')

    if (page === 1) {
      total = Number(body.totalCount) || 0
      console.log(`  총 ${total.toLocaleString()}건`)
    }

    const items = toArr(body?.items)
    if (items.length === 0) break

    const seenSeq = new Set()
    const rows = items
      .filter(i => i.itemSeq && i.itemName && !seenSeq.has(String(i.itemSeq)) && seenSeq.add(String(i.itemSeq)))
      .map(i => ({
        item_seq:        String(i.itemSeq),
        item_name:       String(i.itemName),
        entp_name:       i.entpName || null,
        ingredient_name: null,
        ingredient_code: null,
        etc_otc_name:    null,
        chart:           null,
        form_code_name:  null,
        updated_at:      new Date().toISOString(),
      }))

    if (rows.length > 0) {
      const { error } = await supabase
        .from('drugs')
        .upsert(rows, { onConflict: 'item_seq' })
      if (error) throw new Error(`drugs upsert: ${error.message}`)
      inserted += rows.length
    }

    const maxPage = Math.ceil(total / ROWS)
    bar('drugs', page, maxPage, inserted)

    if (page >= maxPage || items.length < ROWS) break
    page++
    await sleep(DELAY)
  }

  console.log(`\n  완료: ${inserted.toLocaleString()}건`)
}

// ── Phase 2: 건강기능식품 ─────────────────────────────────────────
async function etlSupplements() {
  console.log('\n━━ [Phase 2] 건강기능식품 → supplements ━━')
  let page = 1, total = 0, inserted = 0

  while (true) {
    const url = `${BASE}/1471000/HtfsInfoService03/getHtfsList01`
      + `?serviceKey=${HKEY}&numOfRows=${ROWS}&pageNo=${page}&type=json`

    const json = await fetchJson(url)
    const body = json?.body
    if (!body) throw new Error('응답 body 없음')

    if (page === 1) {
      total = Number(body.totalCount) || 0
      console.log(`  총 ${total.toLocaleString()}건`)
    }

    // 건기식은 items[n].item 래퍼 구조
    const items = toArr(body?.items).map(i => i.item ?? i)
    if (items.length === 0) break

    const seenProd = new Set()
    const rows = items
      .filter(i => i.STTEMNT_NO && i.PRDUCT && !seenProd.has(String(i.STTEMNT_NO)) && seenProd.add(String(i.STTEMNT_NO)))
      .map(i => ({
        product_seq:   String(i.STTEMNT_NO),
        product_name:  String(i.PRDUCT).trim(),
        company_name:  i.ENTRPS || null,
        main_function: null,
        caution:       null,
        updated_at:    new Date().toISOString(),
      }))

    if (rows.length > 0) {
      const { error } = await supabase
        .from('supplements')
        .upsert(rows, { onConflict: 'product_seq' })
      if (error) throw new Error(`supplements upsert: ${error.message}`)
      inserted += rows.length
    }

    const maxPage = Math.ceil(total / ROWS)
    bar('supplements', page, maxPage, inserted)

    if (page >= maxPage || items.length < ROWS) break
    page++
    await sleep(DELAY)
  }

  console.log(`\n  완료: ${inserted.toLocaleString()}건`)
}

// ── Phase 3: DUR 병용금기 ─────────────────────────────────────────
//
// ⚠️ 동결됨 — 이 경로는 더 이상 실행되지 않는다.
//
// 068(성분 단위 상호작용) 적용 시점부터 interactions 테이블은 동결이다. 이 함수는
// 성분쌍을 제품쌍으로 전개해 그 테이블에 써 왔고, 그대로 두면 npm run etl(인자 없음)이
// 전 단계를 도는 과정에서 동결 기준선을 조용히 움직인다.
//
// 동결 기준선(2026-08-28): interactions 305,005행 / md5 d041087f4f064706edda05f1f2743e0f
// 대체 경로: npm run etl:dur-pairs (scripts/etl-dur-ingredient-pairs.mjs)
//            성분쌍을 사실 그대로 ingredient_interactions 에 적재하고 제품 매칭은 조회 시점에 조인한다.
//
// 부수효과였던 drugs.ingredient_code 갱신도 함께 멈춘다 — 그 컬럼은 src/ 에 소비처가 0개다(실측).
async function etlDurInteractions() {
  console.log('\n━━ [Phase 3] DUR 병용금기 — 동결됨 ━━')
  console.log('  interactions 는 068 적용 시점부터 동결이다. 이 단계는 아무것도 쓰지 않는다.')
  console.log('  성분쌍 적재는 npm run etl:dur-pairs 를 쓸 것.')
}

// ── 실행 ──────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const all  = args.length === 0
const run  = flag => all || args.includes(flag)

console.log('━━━ 약사로 케어 ETL 배치 ━━━')
console.log('Supabase:', env['NEXT_PUBLIC_SUPABASE_URL'])
console.log(`Phase: ${[run('--drugs') && 'drugs', run('--supplements') && 'supplements', run('--dur') && 'dur'].filter(Boolean).join(', ')}`)

try {
  if (run('--drugs'))       await etlDrugs()
  if (run('--supplements')) await etlSupplements()
  if (run('--dur'))         await etlDurInteractions()

  console.log('\n━━━ ETL 완료 ━━━')
} catch (e) {
  console.error('\n\n❌ ETL 오류:', e.message)
  process.exit(1)
}
