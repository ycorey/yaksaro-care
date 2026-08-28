/**
 * DUR 단일 약 플래그 적재 — 노인주의 + 효능군중복 (dur_single_flags, 066)
 *
 * DURPrdlstInfoService03 의 품목 단위 오퍼레이션 2종을 전량 적재한다:
 *   · getOdsnAtentInfoList03  (노인주의, ~1,982건 ≈ 20페이지)
 *   · getEfcyDplctInfoList03  (효능군중복, ~7,056건 ≈ 71페이지)
 * 합계 ~91콜 — 개발계정 일 1,000회 한도 내에서 한 번에 끝난다.
 *
 * 키는 병용금기 ETL(etl-dur-ingredient.mjs)과 같은 MFDS_EASY_DRUG_KEY 재사용
 * (같은 DURPrdlstInfoService03 서비스에 이미 등록돼 있음 — 2026-08-26 실호출 확인).
 *
 * 중복 "판정"은 저장하지 않는다 — 효능군중복은 group_code(EFFECT_NAME) 소속 사실만 적재하고,
 * 사용자 등록약 중 같은 군이 2개 이상인지는 앱(src/lib/dur-flags.ts)이 조회 시점에 계산한다.
 *
 * 실행: npm run etl:dur-flags
 *       MAX_PAGES=3 node scripts/etl-dur-flags.mjs   (검증용 — 오퍼레이션당 페이지 상한)
 */
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'

const env = {}
readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8').split('\n').forEach(line => {
  const [k, ...v] = line.split('='); if (k && !k.startsWith('#')) env[k.trim()] = v.join('=').trim()
})
const supabase = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY'], { auth: { persistSession: false } })
const KEY = encodeURIComponent(env['MFDS_EASY_DRUG_KEY'])
const BASE = 'https://apis.data.go.kr'
const ROWS = 100
const DELAY = Number(env['DUR_DELAY'] ?? 170)
const MAX_PAGES = process.env.MAX_PAGES ? Number(process.env.MAX_PAGES) : Infinity
const CP = resolve(process.cwd(), '.etl-dur-flags-checkpoint.json')

const sleep = ms => new Promise(r => setTimeout(r, ms))
const toArr = v => Array.isArray(v) ? v : v ? [v] : []

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

// 오퍼레이션 정의 — item → dur_single_flags 행 매핑
const OPS = [
  {
    name: '노인주의',
    op: 'getOdsnAtentInfoList03',
    toRow: i => ({
      item_seq:    String(i.ITEM_SEQ),
      flag_type:   'elderly_caution',
      group_code:  '',
      // PROHBT_CONTENT 가 비면 성분명이라도 남긴다(무엇 때문에 등재됐는지의 최소 단서)
      description: i.PROHBT_CONTENT || (i.INGR_NAME ? `성분: ${i.INGR_NAME}` : null),
    }),
  },
  {
    name: '효능군중복',
    op: 'getEfcyDplctInfoList03',
    toRow: i => i.EFFECT_NAME ? ({
      item_seq:    String(i.ITEM_SEQ),
      flag_type:   'efficacy_duplicate_group',
      group_code:  String(i.EFFECT_NAME),   // 중복군 = 효능군명
      description: i.PROHBT_CONTENT || null,
    }) : null,  // 군명 없는 행은 중복 판정에 쓸 수 없어 제외
  },
]

async function loadOp({ name, op, toRow }, cp) {
  let page = (cp?.op === op ? cp.page + 1 : 1)
  let total = 0, upserted = cp?.op === op ? (cp.upserted || 0) : 0
  if (page > 1) console.log(`  체크포인트 복원 → ${page - 1}p 완료, ${page}부터 재개`)

  for (;;) {
    if (page > MAX_PAGES) { console.log(`\n  MAX_PAGES(${MAX_PAGES}) 도달 — 중단`); return { upserted, done: false } }
    const url = `${BASE}/1471000/DURPrdlstInfoService03/${op}?serviceKey=${KEY}&numOfRows=${ROWS}&pageNo=${page}&type=json`
    const json = await fetchJson(url)
    const body = json?.body
    if (!body) throw new Error('응답 body 없음: ' + JSON.stringify(json).slice(0, 160))
    if (total === 0) { total = Number(body.totalCount) || 0; console.log(`  [${name}] 총 ${total.toLocaleString()}건`) }

    const items = toArr(body.items)
    if (items.length === 0) break

    // 페이지 내 dedupe — unique (item_seq, flag_type, group_code) 충돌은 한 배치 안에서만 문제가 된다
    const seen = new Set()
    const rows = items
      .map(toRow)
      .filter(r => r && r.item_seq && r.item_seq !== 'undefined')
      .filter(r => { const k = `${r.item_seq}|${r.group_code}`; return !seen.has(k) && seen.add(k) })
      .map(r => ({ ...r, source: 'dur_api', updated_at: new Date().toISOString() }))

    if (rows.length) {
      const { error } = await supabase.from('dur_single_flags').upsert(rows, { onConflict: 'item_seq,flag_type,group_code' })
      if (error) throw new Error(`dur_single_flags upsert: ${error.message}`)
      upserted += rows.length
    }

    const maxPage = Math.ceil(total / ROWS)
    process.stdout.write(`\r  [${name}] ${page}/${maxPage}p · 적재 ${upserted.toLocaleString()}행        `)
    writeFileSync(CP, JSON.stringify({ op, page, upserted }))
    if (page >= maxPage || items.length < ROWS) break
    page++
    await sleep(DELAY)
  }
  console.log('')
  return { upserted, done: true }
}

async function main() {
  console.log('━━ DUR 단일 약 플래그 ETL (노인주의 + 효능군중복) ━━')
  const cp = existsSync(CP) ? JSON.parse(readFileSync(CP, 'utf-8')) : null
  // 체크포인트가 뒤 오퍼레이션 것이면 앞 오퍼레이션은 이미 끝난 것 — 건너뛴다
  const startIdx = cp ? Math.max(0, OPS.findIndex(o => o.op === cp.op)) : 0

  let allDone = true
  const counts = {}
  for (let i = startIdx; i < OPS.length; i++) {
    const { upserted, done } = await loadOp(OPS[i], i === startIdx ? cp : null)
    counts[OPS[i].name] = upserted
    if (!done) { allDone = false; break }
  }

  if (allDone && existsSync(CP)) unlinkSync(CP)

  const { count } = await supabase.from('dur_single_flags').select('*', { count: 'exact', head: true })
  console.log(`\n완료 — 이번 실행 적재: ${JSON.stringify(counts)} · 테이블 총 ${count?.toLocaleString()}행`)
}

main().catch(e => { console.error('\n실패:', e.message); process.exit(1) })
