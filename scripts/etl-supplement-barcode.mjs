/**
 * 건기식 바코드 ETL — 식품안전나라 I2570(바코드연계제품정보) → supplements.barcode
 *
 * 우리 supplements는 품목제조신고번호(product_seq) 키. I2570은 바코드 키라 코드로 직접
 * 못 잇는다 → 제품명(PRDT_NM) 필터로 후보를 받아 정규화된 "제품명(+회사명)" 보수적 매칭.
 * 매칭 실패/신제품은 비워둠(앱에서 이름 검색으로 폴백).
 *
 * 한계(설계상 수용): I2570 원본(대한상공회의소 유통물류진흥원)은 2018 이후 갱신 중단 →
 *   최신 신제품 커버리지 낮음. 살아있는 전수는 코리안넷 유료 API로 승급(v2).
 *
 * ⚠️ 키: 식품안전나라 자체 인증키 (data.go.kr 키와 별개). foodsafetykorea.go.kr/apiMain.do
 *   에서 발급 → .env.local 의 FOODSAFETY_API_KEY. (data.go.kr 15060549 활용신청만으로는
 *   이 엔드포인트 키가 안 나올 수 있음 — RESULT.CODE 로 인증 여부 진단.)
 * 스펙: http://openapi.foodsafetykorea.go.kr/api/{키}/I2570/json/{start}/{end}/PRDT_NM={제품명}
 *   응답: I2570.row[] · BRCD_NO(바코드) · PRDT_NM(제품명) · CMPNY_NM(회사명) · 품목분류
 * 사전조건: 027_barcode.sql 적용.
 * 실행:
 *   node scripts/etl-supplement-barcode.mjs --dry     쓰기 없이 매칭만 측정
 *   node scripts/etl-supplement-barcode.mjs            실제 적재
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'

const env = {}
readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8').split('\n').forEach(line => {
  const [k, ...v] = line.split('='); if (k && !k.startsWith('#')) env[k.trim()] = v.join('=').trim()
})
const supabase = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY'], { auth: { persistSession: false } })
const DRY   = process.argv.includes('--dry')
const DELAY = 120  // ms, API 매너
// 소량 검증용: --limit N (키·매칭 확인 후 전체 실행). 0=전체
const LIMIT = (() => { const i = process.argv.indexOf('--limit'); return i >= 0 ? Number(process.argv[i + 1]) || 0 : 0 })()

// ── 식품안전나라 I2570 스펙 ──────────────────────────────────────────
const API_KEY    = env['FOODSAFETY_API_KEY'] || env['MFDS_HEALTH_FOOD_KEY']
const API_BASE   = 'http://openapi.foodsafetykorea.go.kr/api'
const SERVICE    = 'I2570'
const FIELD_NAME = 'PRDT_NM'    // 제품명
const FIELD_CODE = 'BRCD_NO'    // 바코드번호
const FIELD_COMP = 'CMPNY_NM'   // 회사명
// ────────────────────────────────────────────────────────────────────

// 제품명 정규화: 괄호내용·공백·기호 무시(보수적 동일성 비교용)
function norm(s) {
  return String(s || '').toLowerCase().replace(/\(.*?\)/g, '').replace(/[\s·.\-]/g, '').trim()
}
const sleep = ms => new Promise(r => setTimeout(r, ms))

let resultLogged = false
async function fetchByName(name) {
  // PRDT_NM 필터(부분일치) → 후보 최대 20건
  const url = `${API_BASE}/${encodeURIComponent(API_KEY)}/${SERVICE}/json/1/20`
    + `/${FIELD_NAME}=${encodeURIComponent(name)}`
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return []
    const json = await res.json()
    const node = json?.[SERVICE]
    // 최초 1회 RESULT 코드 출력(인증/한도 진단)
    if (!resultLogged) {
      resultLogged = true
      const code = node?.RESULT?.CODE ?? json?.RESULT?.CODE ?? '(없음)'
      console.log(`  API RESULT.CODE: ${code} ${node?.RESULT?.MSG ?? json?.RESULT?.MSG ?? ''}`)
    }
    const raw = node?.row
    return Array.isArray(raw) ? raw : (raw ? [raw] : [])
  } catch { return [] }
}

// "정규화 제품명 완전 일치 + (회사명 일부 일치 or 동명 단일)" 1건만 채택 → 오매칭 차단
function pickMatch(supp, items) {
  const sn = norm(supp.product_name), sc = norm(supp.company_name)
  const exact = items.filter(it =>
    norm(it[FIELD_NAME]) === sn && /^\d{8,14}$/.test(String(it[FIELD_CODE] || '').replace(/\D/g, '')))
  if (exact.length === 0) return null
  const byComp = sc ? exact.find(it => {
    const c = norm(it[FIELD_COMP]); return c && (c.includes(sc) || sc.includes(c))
  }) : null
  const chosen = byComp || (exact.length === 1 ? exact[0] : null)  // 회사 불일치+동명 다수면 보류
  return chosen ? String(chosen[FIELD_CODE]).replace(/\D/g, '') : null
}

async function main() {
  console.log('━━ 건기식 바코드 ETL (식품안전나라 I2570 → supplements.barcode) ━━')
  console.log(`  모드: ${DRY ? 'DRY RUN(매칭만)' : 'UPSERT(적재)'}`)
  if (!API_KEY) { console.error('  ✗ FOODSAFETY_API_KEY(또는 MFDS_HEALTH_FOOD_KEY) 없음 (.env.local)'); process.exit(1) }

  // 아직 바코드 없는 건기식만 대상
  const targets = []
  let from = 0
  for (;;) {
    const { data, error } = await supabase.from('supplements')
      .select('id,product_name,company_name,barcode').is('barcode', null).range(from, from + 999)
    if (error) throw new Error(error.message)
    if (!data?.length) break
    targets.push(...data)
    from += 1000
    if (data.length < 1000) break
  }
  if (LIMIT > 0) targets.splice(LIMIT)
  console.log(`  대상(바코드 미보유) ${targets.length}건${LIMIT ? ` (--limit ${LIMIT})` : ''}`)

  let matched = 0, processed = 0
  for (const supp of targets) {
    processed++
    const items = await fetchByName(supp.product_name)
    const code  = pickMatch(supp, items)
    await sleep(DELAY)
    if (!code) continue
    matched++
    if (DRY) {
      if (matched <= 10) console.log(`  매칭: ${supp.product_name} → ${code}`)
    } else {
      const { error } = await supabase.from('supplements').update({ barcode: code }).eq('id', supp.id)
      if (error) console.warn(`  ⚠ ${supp.product_name}: ${error.message}`)
    }
    if (processed % 100 === 0) console.log(`  진행 ${processed}/${targets.length} · 매칭 ${matched}`)
  }
  console.log(`✓ 완료 — 처리 ${processed} · 바코드 매칭 ${matched} (${(matched / Math.max(processed, 1) * 100).toFixed(1)}%)`)
}

main().catch(e => { console.error(e); process.exit(1) })
