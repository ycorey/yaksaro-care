/**
 * 성분 단위 상호작용 — 커버리지·손실 리포트 (읽기 전용)
 *
 * Phase 3a 의 착수 판단 근거를 만든다. 아무것도 쓰지 않는다.
 *
 * 계획서가 요구한 필수 출력:
 *   · 커버 약 수            (규칙이 닿는 drugs)
 *   · 커버 성분 위치 수     (규칙이 닿는 drug_ingredients 행)
 *   · 규칙 행 수
 *   · denylist 미도달 규칙 수  (무기물 가드로 염 변이가 갈려 규칙이 못 닿는 것)
 *   · 신규 등장 무기물 접미    (DENY 목록 갱신을 유도)
 * 여기에 하나 더 — 결합 성분 절단으로 잃은 규칙 수. 매핑표가 `A·B` 의 뒷 성분을
 * 버리기 때문에 생기는 손실이고, 그게 실재하는지는 규칙표가 채워져야 알 수 있다.
 *
 * 실행: npm run report:ingredient-coverage
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'
import { ingredientKey, splitIngredientName } from '../src/lib/ingredient-key.ts'

const env = {}
readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8').split('\n').forEach(line => {
  const [k, ...v] = line.split('='); if (k && !k.startsWith('#')) env[k.trim()] = v.join('=').trim()
})
const supabase = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY'], { auth: { persistSession: false } })

const INORGANIC = new Set([
  'potassium', 'calcium', 'sodium', 'magnesium', 'ferrous', 'ferric', 'zinc', 'iron',
  'ammonium', 'aluminum', 'aluminium', 'lithium', 'chromium', 'selenium', 'manganese',
  'copper', 'molybdenum', 'iodine', 'phosphorus',
])

async function pageAll(table, select) {
  const out = []
  let from = 0
  for (;;) {
    const { data, error } = await supabase.from(table).select(select).range(from, from + 999)
    if (error) throw new Error(`${table}: ${error.message}`)
    if (!data?.length) break
    out.push(...data)
    if (data.length < 1000) break
    from += 1000
  }
  return out
}

async function main() {
  console.log('━━ 성분 단위 상호작용 커버리지 리포트 ━━\n')

  const rules = await pageAll('ingredient_interactions', 'norm_key_a, norm_key_b, dur_ingr_code_a, dur_ingr_code_b')
  const norms = await pageAll('ingredient_norms', 'name_en, norm_key')
  const allPositions = await pageAll('drug_ingredients', 'drug_id, name_en')
  const drugs = await pageAll('drugs', 'id, is_canceled')

  // 분모는 **정상 약의 성분 위치**다. 취소 품목을 섞으면 커버리지가 실제보다 낮게 나오고,
  // 계획서의 목표치(72,475 기준)와도 비교가 안 된다.
  const live = new Set(drugs.filter(d => !d.is_canceled).map(d => d.id))
  const positions = allPositions.filter(p => live.has(p.drug_id))

  if (rules.length === 0) {
    console.log('규칙표가 비어 있다 — npm run etl:dur-pairs 를 먼저 돌릴 것.')
    return
  }

  const nameToKey = new Map(norms.map(n => [n.name_en, n.norm_key]))
  const ourKeys = new Set(norms.map(n => n.norm_key))

  // 규칙이 쓰는 키 중 우리 성분에 존재하는 것
  const ruleKeys = new Set()
  for (const r of rules) { ruleKeys.add(r.norm_key_a); ruleKeys.add(r.norm_key_b) }
  const reachableKeys = new Set([...ruleKeys].filter(k => ourKeys.has(k)))

  // 양쪽 키가 모두 우리 성분에 있어야 그 규칙이 실제로 발동할 수 있다
  const usableRules = rules.filter(r => ourKeys.has(r.norm_key_a) && ourKeys.has(r.norm_key_b))
  const halfRules = rules.filter(r => ourKeys.has(r.norm_key_a) !== ourKeys.has(r.norm_key_b))
  const deadRules = rules.length - usableRules.length - halfRules.length

  // 커버 약·성분 위치 — 규칙 키에 걸리는 성분 위치를 세고 약으로 접는다
  const coveredDrugs = new Set()
  let coveredPositions = 0
  for (const p of positions) {
    const k = nameToKey.get(p.name_en)
    if (k && reachableKeys.has(k)) { coveredPositions++; coveredDrugs.add(p.drug_id) }
  }

  // denylist 미도달 — 규칙이 쓰는 키인데 우리에게 없고, 그 키가 무기물로 시작하는 것.
  // (무기물 가드가 염 변이를 갈라 놓아서 한 염의 규칙이 나머지에 안 닿는 자리)
  const unreachable = [...ruleKeys].filter(k => !ourKeys.has(k))
  const denylistMiss = unreachable.filter(k => INORGANIC.has(k.split(' ')[0]))

  // 신규 등장 무기물 접미 — 우리 성분명의 마지막 낱말 중 무기물인데 DENY 로 안 잡힌 것
  const newSuffix = new Map()
  for (const n of norms) {
    const last = n.norm_key.split(' ').pop()
    if (last && INORGANIC.has(last)) newSuffix.set(last, (newSuffix.get(last) ?? 0) + 1)
  }

  // 결합 성분 절단 손실 — `A·B` 에서 버린 뒷 성분이 실제 규칙에 등장하는가
  const truncatedHits = []
  for (const n of norms) {
    const parts = splitIngredientName(n.name_en)
    if (parts.length < 2) continue
    for (const dropped of parts.slice(1)) {
      const dk = ingredientKey(dropped)
      if (dk && ruleKeys.has(dk)) truncatedHits.push({ name: n.name_en, dropped, key: dk })
    }
  }

  const fmt = n => n.toLocaleString()
  // 같은 규칙이 표기 변형만큼 여러 행으로 저장된다(DUR 이 "Itraconazole" 과
  // "Itraconazole Coated Granules" 를 각각 싣기 때문). 행 수와 규칙 수는 다른 양이다 —
  // 변형 행은 그 표기를 쓰는 제품에 닿기 위해 필요하므로 결함이 아니다.
  const codePairs = new Set(rules
    .filter(r => r.dur_ingr_code_a && r.dur_ingr_code_b)
    .map(r => [r.dur_ingr_code_a, r.dur_ingr_code_b].sort().join('|')))

  console.log('── 규칙 ───────────────────────────────────────')
  console.log(`  규칙 행 수                 ${fmt(rules.length)}`)
  console.log(`  ↳ DUR 성분코드 쌍 기준     ${fmt(codePairs.size)}  (차이는 같은 규칙의 표기 변형)`)
  console.log(`  양쪽 성분 보유(발동 가능)  ${fmt(usableRules.length)}`)
  console.log(`  한쪽만 보유                ${fmt(halfRules.length)}`)
  console.log(`  양쪽 다 없음               ${fmt(deadRules)}`)
  console.log('\n── 커버리지 ───────────────────────────────────')
  console.log(`  커버 약 수                 ${fmt(coveredDrugs.size)} / ${fmt(live.size)} 정상 약  (수용 기준 1: ≥14,000)`)
  console.log(`  커버 성분 위치 수          ${fmt(coveredPositions)} / ${fmt(positions.length)}  (${(coveredPositions / positions.length * 100).toFixed(1)}%, 수용 기준 2: ≥40%)`)
  console.log(`  규칙이 쓰는 고유 성분 키   ${fmt(ruleKeys.size)}  (그중 우리 보유 ${fmt(reachableKeys.size)})`)
  console.log('\n── 손실 ───────────────────────────────────────')
  console.log(`  우리에게 없는 규칙 키      ${fmt(unreachable.length)}`)
  console.log(`  ↳ denylist 미도달          ${fmt(denylistMiss.length)}  ← 무기물 가드로 염 변이가 갈린 자리`)
  if (denylistMiss.length) console.log(`     예: ${denylistMiss.slice(0, 8).join(' / ')}`)
  console.log(`  결합 성분 절단 손실        ${fmt(truncatedHits.length)}  ← 버린 뒷 성분에 실제 규칙이 있는 경우`)
  for (const t of truncatedHits.slice(0, 15)) console.log(`     ${t.dropped}  (원본: ${t.name.slice(0, 60)})`)
  if (truncatedHits.length > 15) console.log(`     … 외 ${truncatedHits.length - 15}건`)

  if (newSuffix.size) {
    console.log('\n── 무기물 접미 분포(DENY 갱신 판단용) ─────────')
    for (const [s, c] of [...newSuffix.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${s.padEnd(12)} ${fmt(c)}종`)
  }

  console.log('\n── Phase 3b 착수 게이트 ───────────────────────')
  console.log('  지갑당 배지 점등 중앙값 ≤ 2 — 이 리포트로는 알 수 없다.')
  console.log('  실제 사용자 약 조합에 규칙을 붙여 봐야 나오는 수치이고, 그건 3a 의 이중 로깅이 만든다.')
}

main().catch(e => { console.error('\n실패:', e.message); process.exit(1) })
