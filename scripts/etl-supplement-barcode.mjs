/**
 * 건기식 바코드 ETL — 식약처 바코드 공개데이터 → supplements.barcode (제품명 매칭)
 *
 * 우리 supplements는 품목제조신고번호(product_seq) 키. 식약처 바코드 데이터는
 * 품목보고번호 키라 코드로 직접 못 잇는다 → 정규화된 "제품명(+회사명)" 보수적 매칭.
 * 매칭 실패/신제품은 비워둠(앱에서 이름 검색으로 폴백).
 *
 * 한계(설계상 수용): 식약처 유통바코드 공개데이터는 2018 이후 갱신 중단 → 최신 신제품
 *   커버리지 낮음. 살아있는 전수가 필요하면 코리안넷(GS1 Korea) 유료 API로 승급(v2).
 *
 * 데이터/키: data.go.kr "식약처_바코드연계제품정보"(15060549) 또는 "유통바코드"(15064775).
 *   ⚠️ 아래 API_* 상수(엔드포인트·파라미터·응답필드)는 선택한 데이터셋 스펙에 맞게
 *      반드시 확인/수정할 것. serviceKey는 .env.local 의 MFDS_BARCODE_KEY.
 * 사전조건: 027_barcode.sql 적용.
 * 실행:
 *   node scripts/etl-supplement-barcode.mjs          실제 적재
 *   node scripts/etl-supplement-barcode.mjs --dry     쓰기 없이 매칭만 측정
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
const DELAY = 120  // ms, API 매너 (일일 한도 보호)

// ── ⚠️ 데이터셋 스펙에 맞게 검증/수정할 상수 ─────────────────────────
// data.go.kr 계정 인증키는 1개를 여러 API가 공유(활용신청만 API별로). 전용 키가
// 없으면 기존 식약처 키 재사용 — 단 바코드 데이터셋 "활용신청" 승인은 별도 필요.
const API_KEY  = env['MFDS_BARCODE_KEY'] || env['MFDS_HEALTH_FOOD_KEY'] || env['MFDS_DRUG_LICENSE_KEY']
const API_BASE = 'https://apis.data.go.kr/1471000/BrcdConnPrdtInfoService/getBrcdConnPrdtInfo' // 확인 필요
const PARAM_NAME = 'prdlstNm'   // 제품명 검색 파라미터 (확인 필요)
const FIELD_NAME = 'PRDLST_NM'  // 응답: 제품명 (확인 필요)
const FIELD_CODE = 'BAR_CD'     // 응답: 바코드 (확인 필요)
const FIELD_COMP = 'BSSH_NM'    // 응답: 회사명 (확인 필요)
// ────────────────────────────────────────────────────────────────────

// 제품명 정규화: 괄호내용·공백·대소문자 무시(보수적 동일성 비교용)
function norm(s) {
  return String(s || '').toLowerCase().replace(/\(.*?\)/g, '').replace(/[\s·.\-]/g, '').trim()
}
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function fetchByName(name) {
  const url = `${API_BASE}?serviceKey=${encodeURIComponent(API_KEY)}`
    + `&${PARAM_NAME}=${encodeURIComponent(name)}&numOfRows=20&pageNo=1&type=json`
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return []
    const json = await res.json()
    const raw  = json?.body?.items ?? json?.items
    return Array.isArray(raw) ? raw : (raw ? [raw] : [])
  } catch { return [] }
}

// 후보 중 "정규화 제품명 완전 일치 + (회사명 일부 일치 or 무관)" 1건만 채택 → 오매칭 차단
function pickMatch(supp, items) {
  const sn = norm(supp.product_name), sc = norm(supp.company_name)
  const exact = items.filter(it => norm(it[FIELD_NAME]) === sn && /^\d{8,14}$/.test(String(it[FIELD_CODE] || '').replace(/\D/g, '')))
  if (exact.length === 0) return null
  const byComp = sc ? exact.find(it => norm(it[FIELD_COMP]).includes(sc) || sc.includes(norm(it[FIELD_COMP]))) : null
  const chosen = byComp || (exact.length === 1 ? exact[0] : null)  // 회사 불일치+동명이품 다수면 보류
  return chosen ? String(chosen[FIELD_CODE]).replace(/\D/g, '') : null
}

async function main() {
  console.log('━━ 건기식 바코드 ETL (식약처 공개데이터 → supplements.barcode) ━━')
  console.log(`  모드: ${DRY ? 'DRY RUN(매칭만)' : 'UPSERT(적재)'}`)
  if (!API_KEY) { console.error('  ✗ MFDS_BARCODE_KEY 없음 (.env.local)'); process.exit(1) }

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
  console.log(`  대상(바코드 미보유) ${targets.length}건`)

  let matched = 0, processed = 0
  for (const supp of targets) {
    processed++
    const items = await fetchByName(supp.product_name)
    const code  = pickMatch(supp, items)
    await sleep(DELAY)
    if (!code) continue
    matched++
    if (DRY) {
      if (matched <= 8) console.log(`  매칭: ${supp.product_name} → ${code}`)
    } else {
      const { error } = await supabase.from('supplements').update({ barcode: code }).eq('id', supp.id)
      if (error) console.warn(`  ⚠ ${supp.product_name}: ${error.message}`)
    }
    if (processed % 100 === 0) console.log(`  진행 ${processed}/${targets.length} · 매칭 ${matched}`)
  }
  console.log(`✓ 완료 — 처리 ${processed} · 바코드 매칭 ${matched} (${(matched / Math.max(processed, 1) * 100).toFixed(1)}%)`)
}

main().catch(e => { console.error(e); process.exit(1) })
