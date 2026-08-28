/**
 * 성분명 → 정규화 키 매핑 적재 (ingredient_norms, 068)
 *
 * 우리 drug_ingredients.name_en(고유 4,370)을 ingredientKey() 로 접어 매핑표를 만든다.
 * 외부 API 를 부르지 않는다 — 입력이 전부 우리 DB 라 비용도 한도도 없다.
 *
 * 왜 매핑표인가: norm_key 는 가변 규칙(src/lib/ingredient-key.ts)에서 파생된 값이라
 * 성분 위치 91,507행에 굳히면 규칙 하나 고칠 때마다 전량 재계산이 필요하다.
 * 고유 이름 4,370행만 유지하면 규칙 변경이 초 단위 원자적 재작성이 된다.
 *
 * ⚠️ 결합 성분(`A·B`)의 한계: ingredient_norms.name_en 이 PK 라 한 이름에 키를 하나만 담는다.
 *    실측 69개 이름(고유의 1.6%)이 `·`/`/` 로 두 성분 이상을 잇는다
 *    (Piperacillin Sodium·Tazobactam Sodium, Amoxicillin·Clavulanate Potassium …).
 *    허가명이 주성분을 앞에 두는 관례라 **첫 성분**을 채택하고, 잘라낸 뒷 성분은
 *    리포트에 전부 출력한다 — 조용히 버리면 그 성분의 DUR 규칙이 안 닿는 것을 아무도 모른다.
 *    뒷 성분에 실제 규칙이 있는지는 성분쌍 적재 후 report-ingredient-gap 으로 판단한다.
 *
 * 실행: npm run etl:ingredient-norms
 *       npm run etl:ingredient-norms -- --dry   (쓰지 않고 리포트만)
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

const DRY = process.argv.includes('--dry')

// 무기물 단독 양이온 — ingredient-key.ts 의 INORGANIC_CATION 과 같은 목록.
// 여기서는 "제거가 거부된 이름"을 세기 위해서만 쓴다(판정에는 안 쓴다).
const INORGANIC = new Set([
  'potassium', 'calcium', 'sodium', 'magnesium', 'ferrous', 'ferric', 'zinc', 'iron',
  'ammonium', 'aluminum', 'aluminium', 'lithium', 'chromium', 'selenium', 'manganese',
  'copper', 'molybdenum', 'iodine', 'phosphorus',
])

async function loadDistinctNames() {
  const names = new Map()   // name_en → 성분 위치 수(빈도)
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('drug_ingredients')
      .select('name_en')
      .range(from, from + 999)
    if (error) throw new Error(`drug_ingredients select: ${error.message}`)
    if (!data?.length) break
    for (const r of data) {
      const n = (r.name_en ?? '').trim()
      if (n) names.set(n, (names.get(n) ?? 0) + 1)
    }
    process.stdout.write(`\r  drug_ingredients 읽는 중… ${from + data.length}행 · 고유 ${names.size}`)
    if (data.length < 1000) break
    from += 1000
  }
  console.log('')
  return names
}

async function main() {
  console.log(`━━ 성분명 정규화 매핑 적재 (ingredient_norms)${DRY ? ' — DRY RUN' : ''} ━━`)

  const names = await loadDistinctNames()
  if (names.size === 0) throw new Error('drug_ingredients 가 비어 있다 — 적재를 중단한다')

  const rows = []
  const byKey = new Map()          // norm_key → [name_en]  (병합 클러스터 관측용)
  const truncated = []             // 결합 성분에서 잘라낸 것
  const guardHeld = []             // 무기물 가드로 제거가 거부된 것
  let emptyKey = 0

  for (const [name, freq] of names) {
    const parts = splitIngredientName(name)
    const head = parts[0] ?? name
    const key = ingredientKey(head)

    if (!key) { emptyKey++; continue }          // 키를 못 만든 이름은 매핑하지 않는다(조인에서 그냥 빠진다)
    if (parts.length > 1) truncated.push({ name, kept: head, dropped: parts.slice(1), freq })
    if (INORGANIC.has(key.split(' ')[0]) && key.includes(' ')) guardHeld.push(key)

    rows.push({ name_en: name, norm_key: key, rule_version: 'v1', source: 'drug_ingredients' })
    if (!byKey.has(key)) byKey.set(key, [])
    byKey.get(key).push(name)
  }

  const merges = [...byKey.entries()].filter(([, ns]) => ns.length > 1)

  console.log('')
  console.log('── 리포트 ─────────────────────────────────────')
  console.log(`  고유 성분명            ${names.size.toLocaleString()}`)
  console.log(`  매핑 생성              ${rows.length.toLocaleString()}`)
  console.log(`  고유 norm_key          ${byKey.size.toLocaleString()}  (병합으로 ${(rows.length - byKey.size).toLocaleString()}개 이름이 접힘)`)
  console.log(`  병합 클러스터          ${merges.length.toLocaleString()}`)
  console.log(`  키 생성 실패(제외)     ${emptyKey.toLocaleString()}`)
  console.log(`  무기물 가드로 유지     ${new Set(guardHeld).size.toLocaleString()}종  ← 이 종들은 염 변이가 서로 다른 키로 남는다(미도달 규칙의 원인)`)
  console.log(`  결합 성분 절단         ${truncated.length.toLocaleString()}개 이름`)

  if (truncated.length) {
    console.log('\n  ⚠️ 잘라낸 뒷 성분 — 이 성분들의 DUR 규칙은 해당 제품에 닿지 않는다:')
    for (const t of truncated.sort((a, b) => b.freq - a.freq).slice(0, 25)) {
      console.log(`     ${String(t.freq).padStart(4)}위치  ${t.kept}  ⟵ 버림: ${t.dropped.join(' , ').slice(0, 90)}`)
    }
    if (truncated.length > 25) console.log(`     … 외 ${truncated.length - 25}개`)
  }

  if (DRY) { console.log('\nDRY RUN — 아무것도 쓰지 않았다.'); return }

  console.log('')
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500).map(r => ({ ...r, updated_at: new Date().toISOString() }))
    const { error } = await supabase.from('ingredient_norms').upsert(chunk, { onConflict: 'name_en' })
    if (error) throw new Error(`ingredient_norms upsert: ${error.message}`)
    process.stdout.write(`\r  upsert ${Math.min(i + 500, rows.length)}/${rows.length}`)
  }
  console.log('')

  const { count } = await supabase.from('ingredient_norms').select('*', { count: 'exact', head: true })
  console.log(`완료 — ingredient_norms 총 ${(count ?? 0).toLocaleString()}행`)
}

main().catch(e => { console.error('\n실패:', e.message); process.exit(1) })
