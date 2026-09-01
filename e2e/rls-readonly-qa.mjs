// 약사 토큰 RLS 누수 — **읽기 전용** 상시 게이트.
//
// 왜 이 파일이 따로 있는가 (pharmacist-rls-qa 가 이미 있는데):
//   pharmacist-rls-qa 는 service_role 로 임시 약사·약국·환자를 **시드하고 삭제한다.**
//   그래서 운영 DB 를 대상으로 돌릴 수 없고, ci.yml 의 db-gate 는 테스트 DB 전용
//   (workflow_dispatch) 으로 묶여 있다. 그런데 2026-09-01 실측:
//       · TEST_SUPABASE_URL / _ANON_KEY / _SERVICE_ROLE_KEY / PROD_SUPABASE_REF 시크릿 **전부 부재**
//       · workflow_dispatch 실행 **0건**
//   → 14종이 **한 번도 돌지 않았다.** `if:` 한 줄을 뒤집어도 첫 스텝에서 fail-closed 로 죽는다.
//      테스트 Supabase 프로젝트가 없는 것이 진짜 원인이다.
//
//   이 파일은 그 공백을 **지금 있는 것만으로** 메운다. 시드하지 않으므로 운영을 쳐도 안전하고,
//   anon 키 + 카나리 약사 계정(smoke.yml 이 이미 매일 쓰는 것)만 있으면 된다.
//   쓰기 능력을 아예 주지 않는 것으로 안전을 보장하는 방식은 embed-integrity-qa 와 같다.
//
// 증명 목표 — **환자 0명인 카나리 약사는 환자 행을 정확히 0건 본다.**
//   그 불변식이 깨지는 순간이 곧 RLS 회귀다. 시드 없이 성립하는 유일한 강한 단언이다.
//   ① 070: interactions · ingredient_interactions 를 사용자 토큰이 못 읽는다
//   ② 064: prescription_diagnoses 에 약사 정책이 없다 (의도된 공백 — 좋은 마음으로 추가되기 쉬운 자리)
//   ③ 051/053: profiles 직접 조회는 본인 행뿐이다
//   ④ 071/014: 환자 데이터가 보이면 그 환자는 반드시 pharmacist_patient_view 에도 있어야 한다
//
// ⚠️ 대조군(C1·C2)이 먼저다. 로그인이 실패하면 모든 표가 0건이 되어 **누수 단언이 전부 거짓 통과**한다.
//    그래서 "볼 수 있어야 하는 것이 보이는가" 를 먼저 증명하지 못하면 여기서 즉시 실패한다.
//
// 쓰기: 없다. signInWithPassword 외에 어떤 변경도 하지 않는다(smoke-authenticated 와 동일).
// 실행: SMOKE_PHARMACIST_EMAIL=… SMOKE_PHARMACIST_PASSWORD=… node e2e/rls-readonly-qa.mjs
import { createClient } from '@supabase/supabase-js'
import { loadPublicEnv } from './_env.mjs'

const EMAIL = process.env.SMOKE_PHARMACIST_EMAIL
const PASSWORD = process.env.SMOKE_PHARMACIST_PASSWORD

if (!EMAIL || !PASSWORD) {
  console.log('⚠️  SMOKE_PHARMACIST_EMAIL/PASSWORD 미설정 — 읽기 전용 RLS 게이트를 건너뜁니다.')
  process.exit(0)
}

const { URL_, ANON } = loadPublicEnv()

const results = []
const check = (name, cond, extra = '') => {
  results.push({ name, pass: !!cond })
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`)
  return !!cond
}

// 닫힌 표를 읽는 방법은 두 가지 결과를 낸다:
//   · 정책만 없앤 경우(070)      → 0행, 에러 없음
//   · GRANT 까지 회수한 경우      → 42501 permission denied
// 둘 다 "닫혔다" 는 같은 뜻이므로 둘 다 통과로 본다. 구분해서 표시만 한다.
async function closedTable(sb, table) {
  const r = await sb.from(table).select('*', { count: 'exact', head: true })
  if (r.error) {
    const denied = /permission denied|not exist|42501|42P01/i.test(r.error.message)
    return { closed: denied, how: denied ? 'GRANT 회수' : 'ERR: ' + r.error.message }
  }
  return { closed: (r.count ?? 0) === 0, how: `${r.count}행` }
}

const sb = createClient(URL_, ANON, { auth: { autoRefreshToken: false, persistSession: false } })

let failedHard = false
try {
  // ── 로그인 ──────────────────────────────────────────────────────
  const { data: auth, error: authErr } = await sb.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
  const uid = auth?.user?.id
  if (!check('C0 카나리 약사 로그인', !authErr && !!uid, authErr?.message ?? `uid=${uid?.slice(0, 8)}…`)) {
    failedHard = true
    throw new Error('로그인 실패 — 이후 단언은 의미가 없다(전부 0건이 되어 거짓 통과한다)')
  }

  // ── 대조군: 보여야 하는 것이 보이는가 ───────────────────────────
  // 이게 통과해야만 아래의 "0건" 들이 증거가 된다.
  const self = await sb.from('profiles').select('id').eq('id', uid)
  if (!check('C1 본인 profiles 행이 보인다 (auth.uid() 가 실제로 설정됐다)',
        !self.error && self.data?.length === 1, self.error?.message ?? `${self.data?.length}행`)) failedHard = true

  // 070 이 명시적으로 "같이 좁히면 안 된다" 고 못박은 표. 약 지갑이 사용자 토큰으로 읽는다.
  // 여기가 0 이 되면 배지가 통째로 사라진 것이고, 동시에 이 게이트의 대조군도 무너진다.
  const flags = await sb.from('dur_single_flags').select('*', { count: 'exact', head: true })
  if (!check('C2 dur_single_flags 는 열려 있다 (070 의 ⚠️ — 좁히면 약 지갑 배지가 사라진다)',
        !flags.error && (flags.count ?? 0) > 0, flags.error?.message ?? `${flags.count}행`)) failedHard = true

  if (failedHard) throw new Error('대조군 실패 — 누수 단언을 신뢰할 수 없어 중단한다')

  // ── 누수 단언 ───────────────────────────────────────────────────
  for (const [table, why] of [
    ['interactions',            '070: DUR 등재 원문. 라우트는 닫혔어도 PostgREST 로 열려 있던 자리'],
    ['ingredient_interactions', '070: 068 의 성분 규칙표. 소비 코드가 붙기 전에 닫아 둔다'],
    ['prescription_diagnoses',  '064: 질병분류기호. 약사 정책 없음은 의도된 공백이다'],
  ]) {
    const { closed, how } = await closedTable(sb, table)
    if (!check(`L 약사 토큰이 ${table} 를 못 읽는다`, closed, `${how} · ${why}`)) failedHard = true
  }

  // 051/053: 약사는 profiles 를 직접 못 읽고 컬럼을 좁힌 뷰로만 본다.
  // 본인 행 1개는 profiles_self 로 정상 노출이므로 "본인 외 0건" 이 단언이다.
  const allProf = await sb.from('profiles').select('id')
  const others = (allProf.data ?? []).filter(r => r.id !== uid)
  if (!check('L profiles 직접 조회는 본인 행뿐이다 (051/053 뷰 분리)',
        !allProf.error && others.length === 0, `본인 외 ${others.length}행`)) failedHard = true

  // 071/014: 환자 데이터가 한 행이라도 보이면, 그 환자는 pharmacist_patient_view 에도 있어야 한다.
  // 카나리 약사는 단골 환자 0명이므로 정상 상태에서는 양쪽 다 0 이다.
  const view = await sb.from('pharmacist_patient_view').select('id, full_name, consent_pharmacist_view_at')
  const visible = new Set((view.data ?? []).map(r => r.id))
  check('  (참고) pharmacist_patient_view 에 보이는 환자 수', true, `${visible.size}명`)

  for (const table of ['user_prescriptions', 'user_medications', 'medication_check_logs']) {
    const r = await sb.from(table).select('user_id')
    const leaked = [...new Set((r.data ?? []).map(x => x.user_id))].filter(id => !visible.has(id))
    if (!check(`L ${table} 에 보이는 환자는 전부 뷰에도 있다 (071 §23 동의 AND 조건)`,
          !r.error && leaked.length === 0,
          r.error?.message ?? `총 ${r.data?.length ?? 0}행 · 뷰 밖 환자 ${leaked.length}명`)) failedHard = true
  }

  // 컬럼 확장 탐지 — 뷰에 행이 있을 때만 확인할 수 있다(빈 결과에서는 컬럼을 볼 수 없다).
  if ((view.data?.length ?? 0) > 0) {
    const cols = Object.keys(view.data[0]).sort().join(',')
    if (!check('L pharmacist_patient_view 노출 컬럼이 3개 그대로다',
          cols === 'consent_pharmacist_view_at,full_name,id', cols)) failedHard = true
  } else {
    console.log('  SKIP  pharmacist_patient_view 컬럼 검사 — 뷰가 0행이라 컬럼을 볼 수 없다')
  }
} catch (e) {
  console.error('\n❌ ' + e.message)
  failedHard = true
} finally {
  await sb.auth.signOut().catch(() => {})
}

const pass = results.filter(r => r.pass).length
console.log(`\n${'─'.repeat(56)}\n읽기 전용 RLS 게이트: ${pass}/${results.length} PASS`)
process.exit(failedHard || pass !== results.length ? 1 : 0)
