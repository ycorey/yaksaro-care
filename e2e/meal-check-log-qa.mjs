// 복약 체크 이력 로그 QA — POST /api/meal-checks 뒤에 medication_check_logs 행이 **실제로 남는가**.
//
// 왜 이 테스트가 있는가: 체크 API 는 schedules upsert 만 await 하고 check_logs insert 는
// `void` 로 띄워 두고 응답을 돌려보냈다. 응답 후 인스턴스가 회수되면 insert 가 잘리는데,
// 그 표를 **캘린더가 읽는다**(api/calendar). 유실되면 체크한 날이 캘린더에서 빠지고 화면엔
// 아무 증상이 없다. 2026-09-05 에 `after()` 로 완료를 보장하도록 고쳤고, 이 테스트가 그 선을 지킨다.
//
// 무엇을 재는가: (1) 응답 200 (2) 로그 행이 짧은 유예 안에 생긴다 (3) schedule_id 가 실제
// schedules 행을 가리킨다 (4) 해제도 별도 행으로 쌓인다(append-only).
// 로컬 `next start` 에서는 after() 콜백이 응답 직후 같은 프로세스에서 돈다 — 유예는 넉넉히 5s.
//
// 실행: (1) 서버 기동 (2) node e2e/meal-check-log-qa.mjs   — 자체 시드·정리
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { loadEnv } from './_env.mjs'
import { consentedPatientMeta } from './_seed-meta.mjs'

const BASE = process.env.QR_SIM_BASE || process.env.BASE || 'http://localhost:3000'
const { URL_, ANON, SERVICE } = loadEnv()
const admin = createClient(URL_, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } })

const results = []
const check = (name, cond, extra = '') => {
  results.push({ name, pass: !!cond })
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`)
}
// 라우트와 같은 규약(UTC 날짜) — src/app/api/meal-checks/route.ts today()
const todayUtc = () => new Date().toISOString().split('T')[0]

// ── 시드 ────────────────────────────────────────────────────────────
const now = Date.now()
const email = `e2e-test+${now}@yaksaro-e2e.test`
const password = 'E2e!' + Math.random().toString(36).slice(2) + 'Aa9'
const { data: created, error: cErr } = await admin.auth.admin.createUser({
  email, password, email_confirm: true, user_metadata: consentedPatientMeta(),
})
if (cErr) throw new Error('createUser: ' + cErr.message)
const uid = created.user.id

let failed = false
try {
  const { data: existing } = await admin.from('members').select('id, is_self').eq('owner_id', uid)
  let selfId = (existing ?? []).find(m => m.is_self)?.id
  if (!selfId) {
    const { data: s, error } = await admin.from('members')
      .insert({ owner_id: uid, name: '본인', relation: '본인', is_self: true }).select('id').single()
    if (error) throw new Error('member: ' + error.message)
    selfId = s.id
  }

  // 세션 쿠키 — @supabase/ssr 가 setAll 로 정확한 청킹·이름을 만든다(setup.mjs 와 동일)
  let captured = []
  const ssr = createServerClient(URL_, ANON, { cookies: { getAll: () => [], setAll: (arr) => { captured = arr } } })
  const { error: sErr } = await ssr.auth.signInWithPassword({ email, password })
  if (sErr) throw new Error('signIn: ' + sErr.message)
  if (captured.length === 0) throw new Error('세션 쿠키 캡처 실패')
  const cookie = captured.map(c => `${c.name}=${c.value}`).join('; ')

  const post = (body) => fetch(new URL('/api/meal-checks', BASE), {
    method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
  const logs = async () => {
    const { data, error } = await admin.from('medication_check_logs')
      .select('id, schedule_id, is_checked, logged_at')
      .eq('user_id', uid).eq('check_date', todayUtc()).order('logged_at', { ascending: true })
    if (error) throw new Error('logs: ' + error.message)
    return data ?? []
  }
  // 응답이 돌아온 뒤 로그가 생길 때까지 잠깐 기다린다(after 는 응답 **후** 실행이 정의다)
  const waitLogs = async (n, ms = 5000) => {
    const until = Date.now() + ms
    let rows = await logs()
    while (rows.length < n && Date.now() < until) {
      await new Promise(r => setTimeout(r, 100)); rows = await logs()
    }
    return rows
  }

  console.log('\n[1] 체크 → 로그 1행')
  const t0 = Date.now()
  const r1 = await post({ meal_time: 'morning', is_checked: true })
  const dt = Date.now() - t0
  check('POST /api/meal-checks 200', r1.status === 200, `HTTP ${r1.status} · ${dt}ms`)

  const rows1 = await waitLogs(1)
  check('★로그 행이 남는다(캘린더가 읽는 표)', rows1.length === 1, `${rows1.length}행`)
  check('로그는 체크(true)를 기록한다', rows1[0]?.is_checked === true)

  const { data: sched } = await admin.from('medication_schedules').select('id, is_checked, updated_at')
    .eq('user_id', uid).eq('member_id', selfId).eq('check_date', todayUtc()).eq('meal_time', 'morning').maybeSingle()
  check('schedules 행이 체크됨(응답 전 보장 write)', sched?.is_checked === true)
  check('로그.schedule_id 가 그 schedules 행을 가리킨다', !!sched?.id && rows1[0]?.schedule_id === sched.id,
    `${(rows1[0]?.schedule_id ?? '').slice(0, 8)} vs ${(sched?.id ?? '').slice(0, 8)}`)
  check('schedules.updated_at 이 있다(오늘 복약 카드 시각 출처)', !!sched?.updated_at)

  console.log('\n[2] 해제 → 로그 2행(append-only)')
  const r2 = await post({ meal_time: 'morning', is_checked: false })
  check('해제 POST 200', r2.status === 200, `HTTP ${r2.status}`)
  const rows2 = await waitLogs(2)
  check('★해제도 별도 행으로 쌓인다', rows2.length === 2, `${rows2.length}행`)
  check('마지막 행이 해제(false)', rows2.at(-1)?.is_checked === false)
} catch (e) {
  failed = true
  console.log('  ERROR ' + (e?.message ?? e))
} finally {
  // ── 정리 ──────────────────────────────────────────────────────────
  for (const t of ['medication_check_logs', 'medication_schedules']) {
    const { error } = await admin.from(t).delete().eq('user_id', uid)
    if (error) console.log(`  warn ${t}: ${error.message}`)
  }
  await admin.from('members').delete().eq('owner_id', uid)
  const { error: dErr } = await admin.auth.admin.deleteUser(uid)
  if (dErr) console.log('  warn deleteUser: ' + dErr.message)
}

const pass = results.filter(r => r.pass).length
console.log(`\n===== 복약 체크 이력 로그: ${pass}/${results.length} PASS, ${results.length - pass} FAIL =====`)
if (failed || pass !== results.length) process.exit(1)
