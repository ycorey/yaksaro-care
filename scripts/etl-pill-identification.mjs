/**
 * 낱알식별 정보 전량 적재 — MdcinGrnIdntfcInfoService03 (drug_identification, 067)
 *
 * ⚠️ 선결: data.go.kr 에서 "의약품 낱알식별 정보" 활용신청(자동승인) 후
 *          .env.local 에 MFDS_PILL_ID_KEY 추가 (없으면 MFDS_EASY_DRUG_KEY 폴백).
 *          2026-08-26 실측: 01/02 는 폐기, 03 이 현행. 기존 키 4종 전부 미등록(403).
 *
 * 약 2.5만 건 / 100행 ≈ 250콜 — 개발계정 일 1,000회 한도 내.
 *
 * 필드 매핑 가드: 01→03 개정에서 필드명이 바뀌었을 수 있으므로(추측 금지 — KCD 마스터의 교훈)
 * 첫 페이지의 실제 키를 기대 목록과 대조해 어긋나면 **한 행도 쓰지 않고** 실키 목록을 출력하고 중단한다.
 *
 * 실행: npm run etl:pill-id
 *       MAX_PAGES=3 node scripts/etl-pill-identification.mjs   (검증용)
 */
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'

const env = {}
readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8').split('\n').forEach(line => {
  const [k, ...v] = line.split('='); if (k && !k.startsWith('#')) env[k.trim()] = v.join('=').trim()
})
const supabase = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY'], { auth: { persistSession: false } })
const RAW_KEY = env['MFDS_PILL_ID_KEY'] || env['MFDS_EASY_DRUG_KEY']
if (!RAW_KEY) { console.error('MFDS_PILL_ID_KEY(또는 MFDS_EASY_DRUG_KEY) 가 .env.local 에 없습니다'); process.exit(1) }
const KEY = encodeURIComponent(RAW_KEY)
const BASE = 'https://apis.data.go.kr'
const ROWS = 100
const DELAY = Number(env['PILL_ID_DELAY'] ?? 150)
const MAX_PAGES = process.env.MAX_PAGES ? Number(process.env.MAX_PAGES) : Infinity
const CP = resolve(process.cwd(), '.etl-pill-id-checkpoint.json')

const sleep = ms => new Promise(r => setTimeout(r, ms))
const toArr = v => Array.isArray(v) ? v : v ? [v] : []
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : null }

async function fetchJson(url, attempt = 0) {
  let res
  try { res = await fetch(url) }
  catch (e) { if (attempt < 6) { await sleep(2000 * (attempt + 1)); return fetchJson(url, attempt + 1) } throw e }
  if (res.status === 429 || res.status >= 500) {
    if (attempt < 7) { const w = 2500 * (attempt + 1); process.stdout.write(`\r  ⏳ HTTP ${res.status} — ${w / 1000}s 대기 후 재시도(${attempt + 1})        `); await sleep(w); return fetchJson(url, attempt + 1) }
    throw new Error(`HTTP ${res.status} (재시도 초과)`)
  }
  const text = await res.text()
  if (text.includes('LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS')) throw new Error('일일 호출한도 초과(LIMIT)')
  if (text.includes('SERVICE_KEY_IS_NOT_REGISTERED')) throw new Error('API 키 미등록 — data.go.kr 에서 "의약품 낱알식별 정보(v03)" 활용신청 후 MFDS_PILL_ID_KEY 설정')
  if (text.includes('NO_OPENAPI_SERVICE_ERROR')) throw new Error('서비스 없음/폐기 — 서비스명 버전을 확인할 것 (현행: MdcinGrnIdntfcInfoService03)')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  try { return JSON.parse(text) } catch { throw new Error(`JSON 파싱 실패: ${text.slice(0, 160)}`) }
}

// 기대 필드 — 공공데이터 낱알식별 표준 명세 기준. 핵심(REQUIRED)이 없으면 매핑이 깨진 것.
const REQUIRED = ['ITEM_SEQ', 'DRUG_SHAPE']
const EXPECTED = [...REQUIRED, 'PRINT_FRONT', 'PRINT_BACK', 'COLOR_CLASS1', 'COLOR_CLASS2',
  'LINE_FRONT', 'LINE_BACK', 'LENG_LONG', 'LENG_SHORT', 'THICK', 'FORM_CODE_NAME', 'ITEM_IMAGE']

function assertMapping(first) {
  const keys = Object.keys(first)
  const missing = REQUIRED.filter(k => !(k in first))
  if (missing.length) {
    console.error(`\n필드 매핑 불일치 — 필수 키 부재: ${missing.join(', ')}`)
    console.error(`실제 응답 키: ${keys.join(', ')}`)
    console.error('한 행도 적재하지 않고 중단합니다. 스크립트의 매핑을 실키에 맞춰 수정하세요.')
    process.exit(1)
  }
  const softMissing = EXPECTED.filter(k => !(k in first))
  if (softMissing.length) console.log(`  ⚠️ 기대 키 일부 부재(null 적재됨): ${softMissing.join(', ')}`)
}

async function main() {
  console.log('━━ 낱알식별 전량 적재 (MdcinGrnIdntfcInfoService03) ━━')
  let page = 1, total = 0, upserted = 0
  if (existsSync(CP)) { const c = JSON.parse(readFileSync(CP, 'utf-8')); page = c.page + 1; upserted = c.upserted || 0; console.log(`  체크포인트 복원 → ${c.page}p 완료, ${page}부터 재개`) }

  let mappingChecked = page > 1  // 재개 시엔 이전 실행에서 이미 검증됨

  for (;;) {
    if (page > MAX_PAGES) { console.log(`\n  MAX_PAGES(${MAX_PAGES}) 도달 — 중단`); break }
    const url = `${BASE}/1471000/MdcinGrnIdntfcInfoService03/getMdcinGrnIdntfcInfoList03?serviceKey=${KEY}&numOfRows=${ROWS}&pageNo=${page}&type=json`
    const json = await fetchJson(url)
    const body = json?.body
    if (!body) throw new Error('응답 body 없음: ' + JSON.stringify(json).slice(0, 160))
    if (total === 0) { total = Number(body.totalCount) || 0; if (page === 1) console.log(`  총 ${total.toLocaleString()}건`) }

    const items = toArr(body.items)
    if (items.length === 0) break

    if (!mappingChecked) { assertMapping(items[0]); mappingChecked = true }

    const seen = new Set()
    const rows = items
      .filter(i => i.ITEM_SEQ && !seen.has(String(i.ITEM_SEQ)) && seen.add(String(i.ITEM_SEQ)))
      .map(i => ({
        item_seq:       String(i.ITEM_SEQ),
        print_front:    i.PRINT_FRONT || null,
        print_back:     i.PRINT_BACK || null,
        drug_shape:     i.DRUG_SHAPE || null,
        color_class1:   i.COLOR_CLASS1 || null,
        color_class2:   i.COLOR_CLASS2 || null,
        line_front:     i.LINE_FRONT || null,
        line_back:      i.LINE_BACK || null,
        leng_long:      num(i.LENG_LONG),
        leng_short:     num(i.LENG_SHORT),
        thick:          num(i.THICK),
        form_code_name: i.FORM_CODE_NAME || null,
        image_url:      i.ITEM_IMAGE || null,
        updated_at:     new Date().toISOString(),
      }))

    if (rows.length) {
      const { error } = await supabase.from('drug_identification').upsert(rows, { onConflict: 'item_seq' })
      if (error) throw new Error(`drug_identification upsert: ${error.message}`)
      upserted += rows.length
    }

    const maxPage = Math.ceil(total / ROWS)
    process.stdout.write(`\r  ${page}/${maxPage}p · 적재 ${upserted.toLocaleString()}행        `)
    writeFileSync(CP, JSON.stringify({ page, upserted }))
    if (page >= maxPage || items.length < ROWS) break
    page++
    await sleep(DELAY)
  }

  if (existsSync(CP) && page >= Math.ceil(total / ROWS)) unlinkSync(CP)
  const { count } = await supabase.from('drug_identification').select('*', { count: 'exact', head: true })
  console.log(`\n완료 — 이번 실행 적재 ${upserted.toLocaleString()}행 · 테이블 총 ${count?.toLocaleString()}행`)
}

main().catch(e => { console.error('\n실패:', e.message); process.exit(1) })
