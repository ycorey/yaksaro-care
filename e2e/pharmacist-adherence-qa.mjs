// 약사 체크로그 RLS 시나리오 — 트리거/RLS 레벨 e2e.
// 약사는 동의 단골 환자의 본인(is_self) 로그만 조회. 동의OFF·타약국·가족 로그는 차단.
// 운영 Supabase에 임시 유저/약국/멤버/로그 생성 → 검증 → finally 전량 삭제. Next 서버 불필요.
// 실행: node e2e/pharmacist-adherence-qa.mjs
import { createClient } from '@supabase/supabase-js'
import { loadEnv } from './_env.mjs'

const { URL_, ANON, SERVICE } = loadEnv()
const admin = createClient(URL_, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } })

const results = []
const check = (name, cond, extra = '') => {
  results.push({ name, pass: !!cond })
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`)
}

const now = Date.now()
const pw = 'E2e!' + Math.random().toString(36).slice(2) + 'Aa9'
const phaEmail = `e2e-adh-pha+${now}@yaksaro-e2e.test`   // 단골 약사
const phbEmail = `e2e-adh-phb+${now}@yaksaro-e2e.test`   // 타 약사
const patEmail = `e2e-adh-pt+${now}@yaksaro-e2e.test`    // 환자

let phaUid = null, phbUid = null, patUid = null
let pharmacyA = null, pharmacyB = null, selfMid = null, famMid = null

async function signedClient(email, password) {
  const c = createClient(URL_, ANON, { auth: { autoRefreshToken: false, persistSession: false } })
  const { error } = await c.auth.signInWithPassword({ email, password })
  if (error) throw new Error('signIn ' + email + ': ' + error.message)
  return c
}
async function pharmSees(client) {
  const { data } = await client.from('medication_check_logs').select('id, member_id').eq('user_id', patUid)
  return data ?? []
}

try {
  // 유저 3명
  const mk = async (email) => {
    const { data, error } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true })
    if (error) throw new Error('createUser ' + email + ': ' + error.message)
    return data.user.id
  }
  phaUid = await mk(phaEmail); phbUid = await mk(phbEmail); patUid = await mk(patEmail)

  // 약국 2개(owner=각 약사)
  const mkPharm = async (owner, sfx) => {
    const { data, error } = await admin.from('pharmacies')
      .insert({ owner_id: owner, name: 'E2E약국' + sfx, store_id: `e2e-adh-${sfx}-${now}` })
      .select('id').single()
    if (error) throw new Error('pharmacy ' + sfx + ': ' + error.message)
    return data.id
  }
  pharmacyA = await mkPharm(phaUid, 'A'); pharmacyB = await mkPharm(phbUid, 'B')

  // 환자 멤버: self(트리거가 만들었으면 재사용, 없으면 생성) + family
  const { data: selfM } = await admin.from('members').select('id').eq('owner_id', patUid).eq('is_self', true).maybeSingle()
  selfMid = selfM?.id ?? null
  if (!selfMid) {
    const { data, error } = await admin.from('members').insert({ owner_id: patUid, is_self: true, name: '본인' }).select('id').single()
    if (error) throw new Error('self member: ' + error.message)
    selfMid = data.id
  }
  {
    const { data, error } = await admin.from('members').insert({ owner_id: patUid, is_self: false, name: '가족' }).select('id').single()
    if (error) throw new Error('family member: ' + error.message)
    famMid = data.id
  }

  // 체크 로그 2건: self 1 + family 1
  const { error: lErr } = await admin.from('medication_check_logs').insert([
    { user_id: patUid, member_id: selfMid, check_date: '2026-07-03', meal_time: 'morning', is_checked: true },
    { user_id: patUid, member_id: famMid,  check_date: '2026-07-03', meal_time: 'morning', is_checked: true },
  ])
  if (lErr) throw new Error('logs insert: ' + lErr.message)
  console.log(`\n[준비] 약사A=${phaUid} 약사B=${phbUid} 환자=${patUid} self=${selfMid} fam=${famMid}`)

  const phaC = await signedClient(phaEmail, pw)
  const phbC = await signedClient(phbEmail, pw)

  // T1: 동의 OFF → 약사A 0건
  console.log('\n[T1] 동의 전 — 약사A 조회 0건')
  check('동의 OFF: 약사A 로그 0건', (await pharmSees(phaC)).length === 0)

  // 동의 ON + 단골 세팅
  await admin.from('profiles').update({ regular_pharmacy_id: pharmacyA, consent_pharmacist_view: true }).eq('id', patUid)

  // T2: 동의 ON → 약사A는 self 로그만(가족 제외)
  console.log('\n[T2] 동의 후 — 약사A는 self 로그만')
  const seenA = await pharmSees(phaC)
  check('동의 ON: 약사A 정확히 1건', seenA.length === 1, `len=${seenA.length}`)
  check('그 1건은 self 멤버(가족 제외)', seenA[0]?.member_id === selfMid, `member_id=${seenA[0]?.member_id}`)

  // T3: 타약국 약사B → 0건(단골 아님)
  console.log('\n[T3] 타약국 약사B — 0건')
  check('약사B(타약국) 로그 0건', (await pharmSees(phbC)).length === 0)
} catch (e) {
  check('예외 없이 완주: ' + (e?.message ?? e), false)
} finally {
  await admin.from('medication_check_logs').delete().eq('user_id', patUid ?? '00000000-0000-0000-0000-000000000000')
  if (famMid) await admin.from('members').delete().eq('id', famMid)
  // self 멤버가 트리거 생성분이면 유저 삭제 시 cascade — 명시 삭제는 우리가 만든 경우만 안전하게 시도
  if (pharmacyA) await admin.from('pharmacies').delete().eq('id', pharmacyA)
  if (pharmacyB) await admin.from('pharmacies').delete().eq('id', pharmacyB)
  for (const uid of [phaUid, phbUid, patUid]) {
    if (uid) { await admin.from('members').delete().eq('owner_id', uid); await admin.auth.admin.deleteUser(uid) }
  }
  console.log('\n[정리] 임시 유저·약국·멤버·로그 삭제 완료')
}

const passed = results.filter(r => r.pass).length
const failed = results.length - passed
console.log(`\n===== 약사 체크로그 RLS 시나리오: ${passed}/${results.length} PASS, ${failed} FAIL =====`)
if (failed > 0) { console.log('실패:', results.filter(r => !r.pass).map(r => r.name).join(' | ')); process.exit(1) }
