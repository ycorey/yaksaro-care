/**
 * 성분명 정규화 병합 클러스터 리포트 — 약사 검수용 산출물 생성.
 *
 * 왜 필요한가: ingredientKey() 는 서로 다른 name_en 을 같은 키로 접는다. 그 병합이 옳은지는
 * 코드가 판단할 수 없다 — Atorvastatin Calcium/…Trihydrate 병합은 옳고, Potassium Chloride 를
 * potassium 으로 접는 것은 틀리다. 규칙(무기물 거부)이 후자를 막지만, 남은 병합이 전부 안전한지는
 * 사람이 봐야 한다. 이 스크립트가 그 목록을 유한하게 만들어 준다(실측 137 클러스터 / 이름 300개).
 *
 * 사용:  node scripts/report-ingredient-clusters.mjs > docs/ingredient-norm-clusters.md
 *
 * 읽기 전용 — DB 에 쓰지 않는다.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { ingredientKey, splitIngredientName } from '../src/lib/ingredient-key.ts'

const env = {}
for (const line of readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].trim()
}
const supabase = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY'], {
  auth: { persistSession: false },
})

// 전량 페이징 — .select() 기본 상한(1,000)에 걸리면 클러스터가 조용히 잘린다
async function fetchAll() {
  const rows = []
  const SIZE = 1000
  for (let from = 0; ; from += SIZE) {
    const { data, error } = await supabase
      .from('drug_ingredients')
      .select('name_en, drug_id')
      .range(from, from + SIZE - 1)
    if (error) throw new Error(`drug_ingredients: ${error.message}`)
    if (!data?.length) break
    rows.push(...data)
    if (data.length < SIZE) break
  }
  return rows
}

const rows = await fetchAll()

// name_en → 그 이름을 쓰는 약 수
const drugsByName = new Map()
for (const r of rows) {
  if (!r.name_en) continue
  if (!drugsByName.has(r.name_en)) drugsByName.set(r.name_en, new Set())
  drugsByName.get(r.name_en).add(r.drug_id)
}

// norm_key → 그 키로 접히는 name_en 들
//
// ⚠️ 적재(scripts/etl-ingredient-norms.mjs)와 **같은 방식**이어야 한다.
// 적재는 결합 성분(`A·B`)의 첫 성분으로 접는데 여기서 전체 이름을 접으면,
// 약사가 실제로 적재된 것과 다른 목록을 검수하게 된다.
const byKey = new Map()
const truncated = []   // 결합 성분에서 버린 뒷 성분 — 병합보다 위험한 손실이라 따로 검수한다
for (const name of drugsByName.keys()) {
  const parts = splitIngredientName(name)
  const head = parts[0] ?? name
  const k = ingredientKey(head)
  if (!k) continue
  if (parts.length > 1) {
    truncated.push({ name, kept: head, dropped: parts.slice(1), drugs: drugsByName.get(name)?.size ?? 0 })
  }
  if (!byKey.has(k)) byKey.set(k, [])
  byKey.get(k).push(name)
}
truncated.sort((a, b) => b.drugs - a.drugs)

const clusters = [...byKey.entries()]
  .filter(([, names]) => names.length > 1)
  .map(([key, names]) => ({
    key,
    names: names.sort(),
    drugs: names.reduce((n, x) => n + (drugsByName.get(x)?.size ?? 0), 0),
  }))
  .sort((a, b) => b.drugs - a.drugs)

const mergedNames = clusters.reduce((n, c) => n + c.names.length, 0)
const today = new Date().toISOString().slice(0, 10)

console.log(`# 성분명 정규화 병합 클러스터 — 약사 검수

> 생성: \`node scripts/report-ingredient-clusters.mjs\` · 데이터 기준일 ${today}
> 정규화 규칙: \`src/lib/ingredient-key.ts\` (rule_version v1)

## 왜 검수가 필요한가

\`ingredientKey()\` 는 염·수화물 접미를 반복 제거해 서로 다른 표기를 한 키로 접는다.
병합이 **옳으면** 규칙 하나가 모든 제형에 닿고(예: Atorvastatin Calcium / …Hydrate / …Trihydrate),
**틀리면** 서로 다른 약이 같은 키가 돼 거짓 경고가 된다(예: Potassium Chloride → potassium).

무기물 양이온 거부 규칙이 후자를 막지만, 남은 병합이 전부 안전한지는 사람이 판단해야 한다.
아래 각 클러스터에 \`merge\`(병합 유지) 또는 \`keep\`(분리 필요) 를 적어 주세요.
\`keep\` 이 필요한 항목은 \`ingredient-key.ts\` 의 거부 목록이나 \`ingredient_norms\` 수동 매핑으로 처리한다.

- 고유 성분명: **${drugsByName.size.toLocaleString()}종**
- 병합이 일어나는 클러스터: **${clusters.length}개** (이름 ${mergedNames}개, ${((mergedNames / drugsByName.size) * 100).toFixed(1)}%)
- 나머지 ${(drugsByName.size - mergedNames).toLocaleString()}종은 1:1 이라 검수 대상이 아니다

## 클러스터 (영향 약 수 내림차순)

| 판정 | norm_key | 약 수 | 병합되는 이름 |
|---|---|---|---|`)

for (const c of clusters) {
  // 판정 칸은 비워 둔다 — 검수자가 merge / keep 을 적는 자리
  console.log(`|  | \`${c.key}\` | ${c.drugs.toLocaleString()} | ${c.names.map(n => `\`${n}\``).join(' · ')} |`)
}

console.log(`
## 결합 성분 절단 — 병합보다 먼저 봐 주세요

\`ingredient_norms.name_en\` 이 PK 라 한 이름에 키를 하나만 담는다. 그래서 \`A·B\` 로 적힌
복합 성분은 **첫 성분만** 매핑되고 뒷 성분은 버려진다. 허가명이 주성분을 앞에 두는 관례를
따른 선택이지만, 버려진 성분의 DUR 규칙은 그 제품에 **영원히 닿지 않는다.**

병합이 틀리면 거짓 경고가 뜨지만(눈에 띈다), 절단은 경고가 그냥 안 뜬다(아무도 모른다).
그래서 이쪽을 먼저 본다.

각 줄에 \`ok\`(첫 성분만으로 충분) 또는 \`need\`(뒷 성분도 규칙 대상이어야 함) 를 적어 주세요.
\`need\` 가 하나라도 나오면 \`ingredient_norms\` 의 PK 를 \`(name_en, norm_key)\` 로 넓혀
한 이름이 여러 키를 갖게 한다(마이그레이션 1건).

- 절단된 이름: **${truncated.length}개**

| 판정 | 채택된 성분 | 약 수 | 버려진 성분 |
|---|---|---|---|`)

for (const t of truncated) {
  console.log(`|  | \`${t.kept}\` | ${t.drugs.toLocaleString()} | ${t.dropped.map(d => `\`${d}\``).join(' · ')} |`)
}

console.log(`
## 검수 결과

(판정 열을 채운 뒤 이 절에 요약을 적어 주세요 — \`keep\`/\`need\` 로 판정된 항목과 그 처리 방법)
`)
