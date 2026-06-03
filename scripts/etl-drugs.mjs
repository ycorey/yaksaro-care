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

import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs'
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
// 페이지 단위 스트리밍 방식: 메모리에 전체를 쌓지 않고 페이지마다 즉시 DB upsert.
// 체크포인트 파일(.etl-dur-checkpoint.json)로 중단 시 해당 페이지부터 재개.
async function etlDurInteractions() {
  console.log('\n━━ [Phase 3] DUR 병용금기 → interactions ━━')

  const CHUNK = 200
  const checkpointFile = resolve(process.cwd(), '.etl-dur-checkpoint.json')

  // 체크포인트 복원
  let startPage = 1
  let totalInserted = 0
  let totalUpdated  = 0
  try {
    const cp = JSON.parse(readFileSync(checkpointFile, 'utf-8'))
    startPage      = (cp.page || 0) + 1
    totalInserted  = cp.inserted  || 0
    totalUpdated   = cp.updated   || 0
    console.log(`  체크포인트 복원 → ${cp.page}페이지 완료, ${startPage}페이지부터 재개`)
  } catch {
    console.log('  새로 시작')
  }

  // drugs 전체 맵 로딩 (Supabase 기본 limit=1000이므로 페이지네이션 필수)
  console.log('  drug 맵 로딩...')
  const seqToId = {}
  {
    let offset = 0
    const BATCH = 1000
    while (true) {
      const { data, error } = await supabase
        .from('drugs').select('id, item_seq').range(offset, offset + BATCH - 1)
      if (error) throw new Error(error.message)
      if (!data?.length) break
      for (const d of data) seqToId[d.item_seq] = d.id
      if (data.length < BATCH) break
      offset += BATCH
    }
  }
  console.log(`  drug 맵: ${Object.keys(seqToId).length.toLocaleString()}건`)

  let page = startPage, total = 0

  while (true) {
    const url = `${BASE}/1471000/DURPrdlstInfoService03/getUsjntTabooInfoList03`
      + `?serviceKey=${KEY}&numOfRows=${ROWS}&pageNo=${page}&type=json`

    const json = await fetchJson(url)
    const body = json?.body
    if (!body) throw new Error('DUR 응답 body 없음')

    if (page === 1 || (startPage > 1 && page === startPage)) {
      total = Number(body.totalCount) || 0
      if (startPage === 1) console.log(`  DUR 병용금기 총 ${total.toLocaleString()}건`)
    }
    if (total === 0) total = Number(body.totalCount) || 1

    const items = toArr(body?.items)
    if (items.length === 0) break

    // 이번 페이지 interactions 빌드
    const interactionMap = new Map()
    const ingrUpdates    = new Map()  // item_seq → ingrCode

    for (const i of items) {
      if (!i.ITEM_SEQ || !i.INGR_CODE) continue
      const itemSeq    = String(i.ITEM_SEQ)
      const ingrCode   = String(i.INGR_CODE)
      const mixItemSeq = i.MIXTURE_ITEM_SEQ ? String(i.MIXTURE_ITEM_SEQ) : null
      const mixIngrCode= i.MIXTURE_INGR_CODE ? String(i.MIXTURE_INGR_CODE) : null
      const ingrName   = i.INGR_NAME   || null
      const mixIngrName= i.MIXTURE_INGR_NAME || null
      const content    = i.PROHBT_CONTENT || null

      // ingredient_code 업데이트 대상 수집
      if (!ingrUpdates.has(itemSeq)) ingrUpdates.set(itemSeq, ingrCode)
      if (mixItemSeq && mixIngrCode && !ingrUpdates.has(mixItemSeq)) ingrUpdates.set(mixItemSeq, mixIngrCode)

      // interactions 생성
      if (!mixItemSeq) continue
      const aId = seqToId[itemSeq]
      const bId = seqToId[mixItemSeq]
      if (!aId || !bId || aId === bId) continue

      const [drug_a_id, drug_b_id] = aId < bId ? [aId, bId] : [bId, aId]
      const key = `${drug_a_id}|${drug_b_id}`
      if (!interactionMap.has(key)) {
        interactionMap.set(key, {
          drug_a_id,
          drug_b_id,
          severity:    'contraindicated',
          description: [ingrName, mixIngrName].filter(Boolean).join(' ↔ ') || content || null,
          source:      'dur_api',
          updated_at:  new Date().toISOString(),
        })
      }
    }

    // interactions upsert
    const rows = [...interactionMap.values()]
    for (let k = 0; k < rows.length; k += CHUNK) {
      const { error } = await supabase
        .from('interactions')
        .upsert(rows.slice(k, k + CHUNK), { onConflict: 'drug_a_id,drug_b_id', ignoreDuplicates: true })
      if (error) throw new Error(`interactions upsert: ${error.message}`)
    }
    totalInserted += rows.length

    // ingredient_code 업데이트 (매칭되는 약만)
    const updEntries = [...ingrUpdates.entries()]
    for (let k = 0; k < updEntries.length; k += CHUNK) {
      const seqs = updEntries.slice(k, k + CHUNK).map(([s]) => s)
      const { data: matched } = await supabase.from('drugs').select('id, item_seq').in('item_seq', seqs)
      if (matched?.length) {
        await Promise.all(matched.map(d =>
          supabase.from('drugs')
            .update({ ingredient_code: ingrUpdates.get(d.item_seq), updated_at: new Date().toISOString() })
            .eq('id', d.id)
        ))
        totalUpdated += matched.length
      }
    }

    const maxPage = Math.ceil(total / ROWS)
    bar('DUR', page, maxPage, totalInserted)

    // 체크포인트 저장
    writeFileSync(checkpointFile, JSON.stringify({ page, inserted: totalInserted, updated: totalUpdated }))

    if (page >= maxPage || items.length < ROWS) break
    page++
    await sleep(DELAY)
  }

  // 완료 — 체크포인트 삭제
  if (existsSync(checkpointFile)) unlinkSync(checkpointFile)
  console.log(`\n  완료: interactions ${totalInserted.toLocaleString()}건 / ingredient_code ${totalUpdated.toLocaleString()}건 업데이트`)
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
