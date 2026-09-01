/**
 * DUR 병용금기 → 성분쌍 규칙 적재 (ingredient_interactions, 068)
 *
 * getUsjntTabooInfoList03 전량(797,416행)을 순회하며 **고유 성분쌍**만 남긴다.
 * 응답이 성분 영문명을 직접 준다(INGR_ENG_NAME ↔ MIXTURE_INGR_ENG_NAME) — 우리
 * drug_ingredients.name_en 과 같은 허가정보 원천이라 정규화 후 그대로 조인된다.
 *
 * 제품쌍을 전개하지 않는다: 이 규칙들이 함의하는 제품쌍은 2,664,934개다. 전개하면
 * (a) "어느 성분 때문인지"를 화면에 말할 수 없고 (b) 규칙 하나 고칠 때마다 수백만 행을
 * 다시 써야 한다. 사실(성분쌍)만 저장하고 제품 매칭은 조회 시점에 조인한다.
 *
 * ⚠️ 이 ETL 은 interactions 에 쓰지 않는다. 068 적용 시점부터 그 테이블은 동결이다.
 *    동결 기준선(2026-08-28): 305,005행 / md5 d041087f4f064706edda05f1f2743e0f
 *
 * 계획서와의 이탈 — PROHBT_CONTENT 를 **정제하지 않고 원문 그대로** description 에 넣는다.
 *   계획서는 "정제 후 저장"이라 했으나, 066(dur_single_flags)이 이미 원문을 저장하고
 *   표시 계층에서 sanitizeElderlyNote 로 거르는 구조다. 정제를 ETL 에 구우면 문구 규칙을
 *   고칠 때마다 API 쿼터 1,595콜을 다시 써야 한다. 정제는 Phase 4 의 sanitizeDurNote 가 맡는다.
 *   → 그래서 이 테이블의 description 은 **화면에 그대로 실으면 안 된다.**
 *
 * 페이지 크기 상한은 500 이다(2026-08-28 실측). 600 이상은 HTTP 200 에 빈 본문을 돌려주는
 * **조용한 실패**라, 그대로 쓰면 "데이터 끝"으로 오인해 0행을 쓰고 성공 종료한다.
 * 797,416 ÷ 500 = 1,595페이지. 개발계정 일일 한도(1,000콜)를 넘으므로 체크포인트 재개가 전제다.
 *
 * 실행: npm run etl:dur-pairs
 *       npm run etl:dur-pairs -- --dry        (쓰지 않고 리포트만)
 *       MAX_PAGES=5 npm run etl:dur-pairs     (검증용)
 */
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'
import { ingredientKey } from '../src/lib/ingredient-key.ts'

const env = {}
readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8').split('\n').forEach(line => {
  const [k, ...v] = line.split('='); if (k && !k.startsWith('#')) env[k.trim()] = v.join('=').trim()
})
const supabase = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY'], { auth: { persistSession: false } })
const KEY = encodeURIComponent(env['MFDS_EASY_DRUG_KEY'])
const BASE = 'https://apis.data.go.kr/1471000/DURPrdlstInfoService03/getUsjntTabooInfoList03'

const ROWS = 500                       // 실측 상한. 올리지 말 것 — 아래 가드가 막는다
const DELAY = Number(env['DUR_DELAY'] ?? 170)
const MAX_PAGES = process.env.MAX_PAGES ? Number(process.env.MAX_PAGES) : Infinity
const DRY = process.argv.includes('--dry')
const CP = resolve(process.cwd(), '.etl-dur-ingr-pairs-checkpoint.json')

// 첫 페이지에 반드시 있어야 하는 키. 하나라도 없으면 응답 구조가 바뀐 것이므로
// **0행을 쓰고 중단한다** — 구조가 바뀐 채로 적재하면 조용히 빈 규칙표가 만들어진다.
const REQUIRED_KEYS = ['INGR_CODE', 'INGR_ENG_NAME', 'MIXTURE_INGR_CODE', 'MIXTURE_INGR_ENG_NAME', 'PROHBT_CONTENT']

if (ROWS > 500) { console.error(`ROWS=${ROWS} — API 상한 500 초과. 600 이상은 빈 본문을 돌려줘 0행 적재로 끝난다.`); process.exit(1) }

const sleep = ms => new Promise(r => setTimeout(r, ms))
const toArr = v => (Array.isArray(v) ? v : v ? [v] : [])

async function fetchJson(url, attempt = 0) {
  let res
  try { res = await fetch(url) }
  catch (e) { if (attempt < 6) { await sleep(2000 * (attempt + 1)); return fetchJson(url, attempt + 1) } throw e }
  if (res.status === 429 || res.status >= 500) {
    if (attempt < 7) {
      const w = 2500 * (attempt + 1)
      process.stdout.write(`\r  ⏳ HTTP ${res.status} — ${w / 1000}s 대기 후 재시도(${attempt + 1})        `)
      await sleep(w); return fetchJson(url, attempt + 1)
    }
    throw new Error(`HTTP ${res.status} (재시도 초과)`)
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const text = await res.text()
  if (text.includes('LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS')) throw new Error('LIMIT')
  if (text.includes('SERVICE_KEY_IS_NOT_REGISTERED')) throw new Error('API 키 미등록')
  // 빈 본문 = 조용한 실패(numOfRows 초과 등). "데이터 끝"과 절대 섞지 않는다.
  if (!text.trim()) throw new Error('빈 응답 본문 — 데이터 끝이 아니라 요청 거부다(numOfRows 확인)')
  try { return JSON.parse(text) } catch { throw new Error(`JSON 파싱 실패: ${text.slice(0, 160)}`) }
}

function assertShape(items) {
  const first = items[0]
  const missing = REQUIRED_KEYS.filter(k => !(k in first))
  if (missing.length) {
    throw new Error(`응답 구조 변경 — 없는 키: ${missing.join(', ')}\n실키: ${Object.keys(first).join(',')}\n0행을 쓰고 중단한다.`)
  }
}

/** 전량 페이징 — .select() 기본 상한(1,000)에 걸리면 조용히 잘린다. */
async function pageAll(table, select) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select(select).range(from, from + 999)
    if (error) throw new Error(`${table}: ${error.message}`)
    if (!data?.length) break
    out.push(...data)
    if (data.length < 1000) break
  }
  return out
}

/**
 * ingredient_norms.dur_ingr_code 역적재 — 우리 이름과 DUR 코드를 norm_key 로 잇는다.
 * 판정에는 쓰지 않는다(추적·대조용). 없으면 없는 대로 둔다.
 *
 * codeByKey 를 주지 않으면 이미 적재된 ingredient_interactions 에서 복원한다 —
 * 50분짜리 재스캔 없이 이 단계만 다시 돌릴 수 있어야 한다(--backfill-only).
 */
async function backfillNormCodes(codeByKey) {
  if (!codeByKey) {
    codeByKey = new Map()
    const rules = await pageAll('ingredient_interactions', 'norm_key_a, norm_key_b, dur_ingr_code_a, dur_ingr_code_b')
    for (const r of rules) {
      if (r.dur_ingr_code_a && !codeByKey.has(r.norm_key_a)) codeByKey.set(r.norm_key_a, String(r.dur_ingr_code_a))
      if (r.dur_ingr_code_b && !codeByKey.has(r.norm_key_b)) codeByKey.set(r.norm_key_b, String(r.dur_ingr_code_b))
    }
    console.log(`  규칙표에서 성분코드 복원 ${codeByKey.size.toLocaleString()}키`)
  }

  const norms = await pageAll('ingredient_norms', 'name_en, norm_key, dur_ingr_code')
  const back = norms
    .filter(n => !n.dur_ingr_code && codeByKey.has(n.norm_key))
    .map(n => ({ name_en: n.name_en, norm_key: n.norm_key, dur_ingr_code: codeByKey.get(n.norm_key), rule_version: 'v1', source: 'drug_ingredients' }))
  for (let i = 0; i < back.length; i += 500) {
    const { error } = await supabase.from('ingredient_norms').upsert(back.slice(i, i + 500), { onConflict: 'name_en' })
    if (error) throw new Error(`ingredient_norms 역적재: ${error.message}`)
  }
  console.log(`  DUR 성분코드 역적재   ${back.length.toLocaleString()}행 (매핑 전량 ${norms.length.toLocaleString()}행 대조)`)
}

async function main() {
  if (process.argv.includes('--backfill-only')) {
    console.log('━━ DUR 성분코드 역적재만 실행 ━━')
    await backfillNormCodes(null)
    return
  }
  console.log(`━━ DUR 병용금기 → 성분쌍 ETL${DRY ? ' — DRY RUN' : ''} ━━`)

  const pairs = new Map()      // "keyA|keyB" → { content, codeA, codeB, nameA, nameB }
  const codeByKey = new Map()  // norm_key → INGR_CODE (ingredient_norms 역적재용)
  let startPage = 1
  if (existsSync(CP)) {
    const cp = JSON.parse(readFileSync(CP, 'utf-8'))
    startPage = (cp.page || 0) + 1
    for (const [k, v] of cp.pairs || []) pairs.set(k, v)
    for (const [k, v] of cp.codeByKey || []) codeByKey.set(k, v)
    console.log(`  체크포인트 복원 → ${cp.page}p 완료, ${startPage}부터 재개 (성분쌍 ${pairs.size})`)
  }

  const t0 = Date.now()
  let page = startPage, total = 0, maxPage = Infinity, limitHit = false, scanned = 0

  while (page <= maxPage && (page - startPage) < MAX_PAGES) {
    let json
    try {
      json = await fetchJson(`${BASE}?serviceKey=${KEY}&numOfRows=${ROWS}&pageNo=${page}&type=json`)
    } catch (e) {
      if (e.message === 'LIMIT') { limitHit = true; break }
      throw e
    }
    const body = json?.body
    // body 부재는 "끝"이 아니라 이상 응답이다 — 조용히 성공 종료하지 않는다.
    if (!body) throw new Error(`응답에 body 가 없다(page ${page}): ${JSON.stringify(json).slice(0, 200)}`)
    if (total === 0) { total = Number(body.totalCount) || 0; maxPage = Math.ceil(total / ROWS); console.log(`  총 ${total.toLocaleString()}건 · ${maxPage.toLocaleString()}페이지`) }

    const items = toArr(body.items)
    if (items.length === 0) break
    if (page === startPage) assertShape(items)

    for (const i of items) {
      scanned++
      const ka = ingredientKey(i.INGR_ENG_NAME)
      const kb = ingredientKey(i.MIXTURE_INGR_ENG_NAME)
      if (i.INGR_CODE && ka && !codeByKey.has(ka)) codeByKey.set(ka, String(i.INGR_CODE))
      if (i.MIXTURE_INGR_CODE && kb && !codeByKey.has(kb)) codeByKey.set(kb, String(i.MIXTURE_INGR_CODE))
      // 자기쌍은 규칙이 아니다(같은 성분끼리는 CHECK 제약도 거부한다)
      if (!ka || !kb || ka === kb) continue
      const [a, b] = ka < kb ? [ka, kb] : [kb, ka]
      const k = `${a}|${b}`
      if (!pairs.has(k)) {
        pairs.set(k, {
          content: i.PROHBT_CONTENT || null,     // 원문 그대로 — 정제는 표시 계층
          codeA: a === ka ? (i.INGR_CODE ?? null) : (i.MIXTURE_INGR_CODE ?? null),
          codeB: a === ka ? (i.MIXTURE_INGR_CODE ?? null) : (i.INGR_CODE ?? null),
        })
      }
    }

    process.stdout.write(`\r  ${page}/${maxPage}p · 스캔 ${scanned.toLocaleString()} · 고유 성분쌍 ${pairs.size.toLocaleString()}        `)
    // DRY 는 상태를 남기지 않는다 — 드라이런이 남긴 체크포인트를 실행이 이어받으면
    // "왜 앞 페이지를 건너뛰지?" 를 아무도 설명하지 못한다.
    if (!DRY && (page % 100 === 0 || page === maxPage)) {
      writeFileSync(CP, JSON.stringify({ page, pairs: [...pairs], codeByKey: [...codeByKey] }))
    }
    page++
    await sleep(DELAY)
  }

  const lastPage = page - 1
  const complete = !limitHit && lastPage >= maxPage
  console.log(`\n  순회 ${complete ? '완료' : '중단'}(page ${lastPage}/${maxPage}). 경과 ${((Date.now() - t0) / 60000).toFixed(1)}분${limitHit ? ' — ⚠️ 일일 한도 도달, 다음 실행 시 재개' : ''}`)
  if (!DRY) writeFileSync(CP, JSON.stringify({ page: lastPage, pairs: [...pairs], codeByKey: [...codeByKey] }))

  console.log(`\n── 리포트 ─────────────────────────────────────`)
  console.log(`  스캔한 원본 행        ${scanned.toLocaleString()}`)
  console.log(`  고유 성분쌍(규칙)     ${pairs.size.toLocaleString()}`)
  console.log(`  등장 성분 키          ${codeByKey.size.toLocaleString()}`)

  if (DRY) { console.log('\nDRY RUN — 아무것도 쓰지 않았다.'); return }
  if (pairs.size === 0) { console.log('\n성분쌍 0개 — 쓰지 않는다.'); return }

  const rows = [...pairs.entries()].map(([k, v]) => {
    const [a, b] = k.split('|')
    return {
      norm_key_a: a, norm_key_b: b,
      dur_ingr_code_a: v.codeA ? String(v.codeA) : null,
      dur_ingr_code_b: v.codeB ? String(v.codeB) : null,
      description: v.content,
      source: 'dur_api',
      updated_at: new Date().toISOString(),
    }
  })

  console.log('')
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from('ingredient_interactions')
      .upsert(rows.slice(i, i + 500), { onConflict: 'norm_key_a,norm_key_b' })
    if (error) throw new Error(`ingredient_interactions upsert: ${error.message}`)
    process.stdout.write(`\r  규칙 upsert ${Math.min(i + 500, rows.length)}/${rows.length}`)
  }
  console.log('')

  await backfillNormCodes(codeByKey)

  const { count } = await supabase.from('ingredient_interactions').select('*', { count: 'exact', head: true })
  console.log(`\n완료 — ingredient_interactions 총 ${(count ?? 0).toLocaleString()}행`)

  if (complete && existsSync(CP)) { unlinkSync(CP); console.log('전량 순회 완료 — 체크포인트 삭제') }
  else console.log('부분 실행 — 체크포인트 보존(다음 실행 시 재개)')
}

main().catch(e => { console.error('\n실패:', e.message); process.exit(1) })
