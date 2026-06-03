/**
 * 약사로 케어 — DUR 병용금기 "성분(ingredient) 기반" ETL
 *
 * 기존 etl-drugs.mjs --dur 는 (item_seq A 제품 ↔ item_seq B 제품) 둘 다 우리 DB에
 * 있어야만 매칭 → 우리 drugs(4,795)는 부분집합이라 수율이 거의 0.
 *
 * 이 스크립트는 성분쌍(INGR_CODE ↔ MIXTURE_INGR_CODE)으로 매칭한다:
 *   1) 전체 taboo 페이지를 한 번 순회하며 메모리에 누적
 *        - prodIngr : item_seq → ingr_code  (양쪽 대표제품에서 학습 → 우리 drugs 성분코드 역적재)
 *        - pairs    : "ingrA|ingrB"(정렬) → { content, nameA, nameB }  (고유 성분쌍, 수백~수천개)
 *   2) 우리 drugs의 성분코드(DB 기존 + taboo 학습)를 ingrCode → [drugId] 인덱스로
 *   3) 각 성분쌍을 우리 drugs 교차곱 → interactions upsert
 *
 * 페이지당 DB쓰기 없음 + 딜레이 축소로 6~7시간 → 약 1시간. 체크포인트로 재개.
 * 실행: node scripts/etl-dur-ingredient.mjs        (전체)
 *       MAX_PAGES=40 node scripts/etl-dur-ingredient.mjs   (검증용 — 앞 40페이지만)
 */

import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'

// ── env ──
const env = {}
readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8').split('\n').forEach(line => {
  const [k, ...v] = line.split('=')
  if (k && !k.startsWith('#')) env[k.trim()] = v.join('=').trim()
})
const supabase = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY'], { auth: { persistSession: false } })
const KEY  = encodeURIComponent(env['MFDS_EASY_DRUG_KEY'])
const BASE = 'https://apis.data.go.kr'
const ROWS = 100
const DELAY = Number(env['DUR_DELAY'] ?? 90)
const MAX_PAGES = process.env.MAX_PAGES ? Number(process.env.MAX_PAGES) : Infinity
const CP = resolve(process.cwd(), '.etl-dur-ingr-checkpoint.json')

const sleep = ms => new Promise(r => setTimeout(r, ms))
const toArr = v => (Array.isArray(v) ? v : v ? [v] : [])

async function fetchJson(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const text = await res.text()
  if (text.includes('LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR')) throw new Error('LIMIT')
  if (text.includes('SERVICE_KEY_IS_NOT_REGISTERED_ERROR')) throw new Error('API 키 미등록')
  try { return JSON.parse(text) } catch { throw new Error(`JSON 파싱 실패: ${text.slice(0, 160)}`) }
}

async function main() {
  console.log('━━ DUR 병용금기 (성분 기반) ETL ━━')

  // 1. 우리 drugs: item_seq ↔ id, 기존 ingredient_code
  console.log('  drugs 로딩...')
  const seqToId = new Map()           // item_seq → drug id
  const drugIngr = new Map()          // drug id → ingr_code (기존 + 학습)
  {
    let from = 0
    while (true) {
      const { data, error } = await supabase.from('drugs').select('id,item_seq,ingredient_code').range(from, from + 999)
      if (error) throw new Error(error.message)
      if (!data?.length) break
      for (const d of data) {
        seqToId.set(String(d.item_seq), d.id)
        if (d.ingredient_code) drugIngr.set(d.id, String(d.ingredient_code))
      }
      if (data.length < 1000) break
      from += 1000
    }
  }
  console.log(`  drugs ${seqToId.size}건 (성분코드 기존 ${drugIngr.size}건)`)

  // 2. 체크포인트 복원 또는 신규
  let startPage = 1
  const prodIngr = new Map()          // item_seq → ingr_code
  const pairs = new Map()             // "ingrA|ingrB" → { content, names }
  if (existsSync(CP)) {
    const cp = JSON.parse(readFileSync(CP, 'utf-8'))
    startPage = (cp.page || 0) + 1
    for (const [k, v] of cp.prodIngr || []) prodIngr.set(k, v)
    for (const [k, v] of cp.pairs || []) pairs.set(k, v)
    console.log(`  체크포인트 복원 → ${cp.page}페이지 완료, ${startPage}부터 재개 (성분쌍 ${pairs.size})`)
  }

  // 3. taboo 전체 페이지 순회 (메모리 누적)
  const t0 = Date.now()
  let page = startPage, total = 0, maxPage = Infinity, limitHit = false
  while (page <= maxPage && (page - startPage) < MAX_PAGES) {
    let json
    try {
      json = await fetchJson(`${BASE}/1471000/DURPrdlstInfoService03/getUsjntTabooInfoList03?serviceKey=${KEY}&numOfRows=${ROWS}&pageNo=${page}&type=json`)
    } catch (e) {
      if (e.message === 'LIMIT') { limitHit = true; break }
      throw e
    }
    const body = json?.body
    if (!body) break
    if (total === 0) { total = Number(body.totalCount) || 0; maxPage = Math.ceil(total / ROWS) }
    const items = toArr(body.items)
    if (items.length === 0) break

    for (const i of items) {
      const a = i.INGR_CODE ? String(i.INGR_CODE) : null
      const b = i.MIXTURE_INGR_CODE ? String(i.MIXTURE_INGR_CODE) : null
      if (i.ITEM_SEQ && a) prodIngr.set(String(i.ITEM_SEQ), a)
      if (i.MIXTURE_ITEM_SEQ && b) prodIngr.set(String(i.MIXTURE_ITEM_SEQ), b)
      if (!a || !b || a === b) continue
      const key = a < b ? `${a}|${b}` : `${b}|${a}`
      if (!pairs.has(key)) {
        pairs.set(key, {
          content: i.PROHBT_CONTENT || null,
          nameA: i.INGR_KOR_NAME || null,
          nameB: i.MIXTURE_INGR_KOR_NAME || null,
        })
      }
    }

    process.stdout.write(`\r  순회 ${page}/${maxPage === Infinity ? '?' : maxPage} | 성분쌍 ${pairs.size} | 제품성분 ${prodIngr.size}`)

    if (page % 500 === 0 || page === maxPage) {
      writeFileSync(CP, JSON.stringify({ page, prodIngr: [...prodIngr], pairs: [...pairs] }))
    }
    page++
    await sleep(DELAY)
  }
  const lastPage = page - 1
  console.log(`\n  순회 종료(page ${lastPage}). 경과 ${((Date.now() - t0) / 60000).toFixed(1)}분${limitHit ? ' — ⚠️ 일일 한도 도달, 다음 실행 시 재개' : ''}`)

  // 4. 우리 drugs 성분코드 역적재 (taboo에서 학습한 것)
  const backfill = []
  for (const [seq, id] of seqToId) {
    const ingr = prodIngr.get(seq)
    if (ingr && !drugIngr.has(id)) { drugIngr.set(id, ingr); backfill.push({ id, ingredient_code: ingr }) }
  }
  console.log(`  성분코드 역적재 대상: ${backfill.length}건 (총 매핑 ${drugIngr.size}/${seqToId.size})`)
  for (let k = 0; k < backfill.length; k += 200) {
    await Promise.all(backfill.slice(k, k + 200).map(r =>
      supabase.from('drugs').update({ ingredient_code: r.ingredient_code }).eq('id', r.id)))
  }

  // 5. ingrCode → [drugId] 인덱스
  const ingrToDrugs = new Map()
  for (const [id, ingr] of drugIngr) {
    if (!ingrToDrugs.has(ingr)) ingrToDrugs.set(ingr, [])
    ingrToDrugs.get(ingr).push(id)
  }

  // 6. 성분쌍 교차곱 → interactions
  const rowsMap = new Map()
  let skipped = 0
  for (const [key, meta] of pairs) {
    const [ia, ib] = key.split('|')
    const da = ingrToDrugs.get(ia), db = ingrToDrugs.get(ib)
    if (!da || !db) { skipped++; continue }
    const desc = [meta.nameA, meta.nameB].filter(Boolean).join(' ↔ ') + (meta.content ? ` (${meta.content})` : '')
    for (const a of da) for (const b of db) {
      if (a === b) continue
      const [x, y] = a < b ? [a, b] : [b, a]
      const rk = `${x}|${y}`
      if (!rowsMap.has(rk)) rowsMap.set(rk, { drug_a_id: x, drug_b_id: y, severity: 'contraindicated', description: desc || null, source: 'dur_api', updated_at: new Date().toISOString() })
    }
  }
  const rows = [...rowsMap.values()]
  console.log(`  성분쌍 ${pairs.size} → 매칭쌍 생성 ${rows.length}건 (양쪽 모두 우리 drugs인 성분쌍만; 미커버 성분쌍 ${skipped})`)

  for (let k = 0; k < rows.length; k += 200) {
    const { error } = await supabase.from('interactions').upsert(rows.slice(k, k + 200), { onConflict: 'drug_a_id,drug_b_id', ignoreDuplicates: true })
    if (error) throw new Error(`interactions upsert: ${error.message}`)
    process.stdout.write(`\r  interactions upsert ${Math.min(k + 200, rows.length)}/${rows.length}`)
  }
  console.log('')

  const { count } = await supabase.from('interactions').select('*', { count: 'exact', head: true })
  console.log(`  ✅ 완료. interactions 총 ${(count ?? 0).toLocaleString()}건`)

  // 전체 순회 완료 시에만 체크포인트 삭제 (한도/부분실행은 보존)
  if (!limitHit && lastPage >= maxPage && existsSync(CP)) unlinkSync(CP)
}

main().catch(e => { console.error('\n[ETL 오류]', e.message); process.exit(1) })
