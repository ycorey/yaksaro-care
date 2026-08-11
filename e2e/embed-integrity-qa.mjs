// PostgREST 임베드 ↔ 실제 FK 정합성 검사.
//
// 2026-08-11 장애의 정확한 재발 방지 장치다. 050 이 pharmacies.owner_id 의 FK 를
// profiles → auth.users 로 옮기자 `pharmacies!owner_id(name)` 임베드가 PGRST200 으로
// 죽었는데, database.ts 가 옛 관계를 계속 선언하고 있어(타입이 거짓말) tsc·lint·CI·build 가
// 전부 초록이었다. 즉 **타입 검사로는 원리적으로 못 잡는다** — 임베드 해석은 런타임에
// PostgREST 가 스키마 캐시로 하는 일이기 때문이다. 그래서 실제로 질의해 본다.
//
// 관계 오류(PGRST200/PGRST201)는 RLS 평가보다 **먼저** 나므로, 익명 키로도
// "관계가 깨졌다"(400)와 "권한상 0행"(200)이 명확히 구분된다. 로그인 불필요.
//
// 실행: node e2e/embed-integrity-qa.mjs   (서버 불필요, DB 만 있으면 됨)
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadEnv } from './_env.mjs'

const { URL_, ANON } = loadEnv()
const SRC = fileURLToPath(new URL('../src/', import.meta.url))

const results = []
const check = (name, cond, extra = '') => {
  results.push({ name, pass: !!cond })
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`)
}

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (['.ts', '.tsx'].includes(extname(p))) out.push(p)
  }
  return out
}

// `.from('table')` 뒤에 오는 첫 `.select('...')` 를 짝지어 뽑는다.
// 작은따옴표 리터럴만 대상 — 템플릿 리터럴·변수로 조립한 select 는 정적으로 알 수 없다.
const PAIR = /from\(\s*'([a-z_]+)'\s*\)([\s\S]{0,600}?)\.select\(\s*'([^']*)'/g

const found = []
for (const file of walk(SRC)) {
  const src = readFileSync(file, 'utf8')
  for (const m of src.matchAll(PAIR)) {
    const [, table, , select] = m
    if (!select.includes('(')) continue           // 임베드 없는 평범한 select 는 대상 아님
    const rel = file.replace(SRC, 'src/').replace(/\\/g, '/')
    found.push({ table, select, file: rel })
  }
}

// 같은 (table, select) 조합은 한 번만 질의한다.
const uniq = [...new Map(found.map(f => [`${f.table}|${f.select}`, f])).values()]

console.log(`\n[스캔] 임베드가 포함된 select ${found.length}건 (중복 제거 ${uniq.length}건)`)
const hinted = uniq.filter(u => /![a-z_]+\(/.test(u.select))
console.log(`       그중 FK 힌트(!fk) 사용 ${hinted.length}건 — FK 가 옮겨가면 여기가 먼저 깨진다`)

if (uniq.length === 0) {
  console.log('⚠️  임베드를 하나도 찾지 못했습니다. 정규식이 코드 스타일 변화를 못 따라갔을 수 있습니다.')
  process.exit(1)
}

for (const { table, select, file } of uniq) {
  const url = `${URL_}/rest/v1/${table}?select=${encodeURIComponent(select)}&limit=1`
  let status = 0, code = '', message = ''
  try {
    const res = await fetch(url, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } })
    status = res.status
    if (status >= 400) {
      const body = await res.json().catch(() => ({}))
      code = body.code ?? ''
      message = (body.message ?? '').slice(0, 90)
    }
  } catch (e) {
    message = String(e).slice(0, 90)
  }

  // PGRST200: 관계 없음 / PGRST201: 관계 모호(어느 FK 인지 특정 불가) — 둘 다 임베드 파손이다.
  const brokenRelationship = code === 'PGRST200' || code === 'PGRST201'
  const label = `${table} ← ${select.length > 58 ? select.slice(0, 58) + '…' : select}`
  check(label, !brokenRelationship, brokenRelationship ? `${code} ${message} (${file})` : `HTTP ${status}`)
}

const passed = results.filter(r => r.pass).length
const failed = results.length - passed
console.log(`\n===== 임베드 정합성: ${passed}/${results.length} PASS, ${failed} FAIL =====`)
if (failed > 0) {
  console.log('실패한 임베드는 실제 FK 와 어긋나 있습니다. 스키마를 바꿨다면 쿼리도 함께 고쳐야 합니다.')
  process.exit(1)
}
