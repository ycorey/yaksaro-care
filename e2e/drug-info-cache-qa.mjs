// /api/drugs/info 의 e약은요 DB 캐시(065 drug_summaries) 계약 검증.
// 서버가 localhost:3000 에 떠 있어야 한다(run.mjs 와 동일 전제).
//
//  [A] 캐시 미스 → 외부 호출 → drug_summaries 적재 + 신규 3필드(intrc/sideEffect/storage) 응답
//  [B] 캐시 히트 → fetched_at 불변 (재적재 없음 = 외부 e약은요 재호출 없음의 관측 가능한 증거)
//  [C] e약은요 미등재 item_seq → 그 키로는 캐싱하지 않음 (결과 없음 미캐싱 계약)
//
// 픽스처: 202005623(어린이타이레놀산 — e약은요 등재 실측 2026-08-26) / 198700157(e약은요 미등재 실측).
// 등재 목록이 바뀌면 픽스처를 교체할 것 — 형식이 아니라 실데이터 전제가 무너진 것이다.
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { loadEnv } from './_env.mjs'

const BASE = 'http://localhost:3000'
const LISTED = '202005623'
const UNLISTED = '198700157'

const { URL_, ANON, SERVICE } = loadEnv()
const admin = createClient(URL_, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } })

let pass = 0, fail = 0
const ok = (cond, label) => {
  if (cond) { pass++; console.log(`  ✅ ${label}`) }
  else { fail++; console.log(`  ❌ ${label}`) }
}

// ── 임시 유저 + 세션쿠키 (setup.mjs 의 캡처 패턴, 시드 불필요 — 이 라우트는 인증만 요구)
const email = `e2e-druginfo+${Date.now()}@yaksaro-e2e.test`
const password = 'E2e!' + Math.random().toString(36).slice(2) + 'Aa9'
const { data: created, error: cErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
if (cErr) throw new Error('createUser: ' + cErr.message)
const uid = created.user.id

let captured = []
const ssr = createServerClient(URL_, ANON, { cookies: { getAll: () => [], setAll: (arr) => { captured = arr } } })
const { error: sErr } = await ssr.auth.signInWithPassword({ email, password })
if (sErr) { await admin.auth.admin.deleteUser(uid); throw new Error('signIn: ' + sErr.message) }
const cookieHeader = captured.map(c => `${c.name}=${c.value}`).join('; ')

const get = async (qs) => {
  const res = await fetch(`${BASE}/api/drugs/info?${qs}`, { headers: { cookie: cookieHeader } })
  return { status: res.status, json: await res.json().catch(() => null) }
}
const cacheRow = async (seq) => {
  const { data } = await admin.from('drug_summaries').select('item_seq, efficacy, fetched_at').eq('item_seq', seq).maybeSingle()
  return data
}

try {
  // 사전 조건: 등재 픽스처의 캐시를 비워 미스를 보장
  await admin.from('drug_summaries').delete().eq('item_seq', LISTED)

  console.log('[A] 캐시 미스 → 적재 + 3필드')
  const a = await get(`item_seq=${LISTED}&name=${encodeURIComponent('어린이타이레놀산160밀리그램')}`)
  ok(a.status === 200 && a.json?.found === true, `HTTP 200 found=true (got ${a.status})`)
  ok(!!a.json?.efcy, 'efcy 존재')
  ok('intrc' in (a.json ?? {}) && 'sideEffect' in (a.json ?? {}) && 'storage' in (a.json ?? {}), '신규 3필드 키 존재')
  // 허가정보 정체성 — 필드 "존재"만 보면 다른 약의 값이어도 통과한다. 허가정보 API 는
  // item_seq 필터를 지원하지 않아(전체 1행 반환) 한때 모든 약이 혈액대용제·전문의약품으로
  // 표시됐다(2026-08-27). 분류가 이 약의 것인지까지 본다.
  ok(a.json?.classType === '일반의약품', `classType 정체성 (got ${a.json?.classType})`)
  ok((a.json?.category ?? '').includes('해열'), `category 정체성 (got ${a.json?.category})`)
  const row1 = await cacheRow(LISTED)
  ok(!!row1, 'drug_summaries 행 생성')
  ok(!!row1?.efficacy, '캐시 행에 efficacy 저장')

  console.log('[B] 캐시 히트 → fetched_at 불변')
  const b = await get(`item_seq=${LISTED}&name=${encodeURIComponent('어린이타이레놀산160밀리그램')}`)
  ok(b.status === 200 && b.json?.found === true && !!b.json?.efcy, '두 번째 호출도 동일 응답')
  const row2 = await cacheRow(LISTED)
  ok(row1?.fetched_at === row2?.fetched_at, `fetched_at 불변 (${row1?.fetched_at})`)

  console.log('[C] 미등재 → 그 키로 미캐싱 + 마스터 밖 약 외부 폴백 생존')
  await admin.from('drug_summaries').delete().eq('item_seq', UNLISTED)
  const c = await get(`item_seq=${UNLISTED}&name=${encodeURIComponent('타이레놀정500밀리그람')}`)
  ok(c.status === 200, `HTTP 200 (무해한 응답, got ${c.status})`)
  // 198700157 은 drugs 마스터에도 없다(실측 2026-08-27) — DB-first 도입 후 유일하게
  // 외부 이름-폴백 경로를 지나는 케이스라, 그 경로의 생존을 여기서 겸사 검증한다.
  ok(c.json?.found === true && c.json?.classType === '일반의약품',
     `마스터 밖 약도 외부 이름 폴백으로 해석 (found=${c.json?.found}, classType=${c.json?.classType})`)
  const rowU = await cacheRow(UNLISTED)
  ok(!rowU, '미등재 item_seq 로는 캐시 행 없음')
} finally {
  await admin.auth.admin.deleteUser(uid).catch(() => {})
}

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${pass}/${pass + fail}`)
process.exit(fail === 0 ? 0 : 1)
