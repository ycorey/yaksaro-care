// 약사 토큰 RLS 누수 실측 — B2B 출시 전 유일한 실질 게이트(7차/8차 평가 지적).
//
// 증명 목표: 약사(pharmacies.owner) 토큰으로 환자 건강정보를 조회할 때
//   ✅ 동의 O + 단골 O + 본인(is_self) 멤버  → 조회 가능(양성 대조)
//   ❌ 미동의(consent=false)                 → 0건
//   ❌ 타약국(다른 약국의 단골)               → 0건
//   ❌ 동의 철회(true→false)                 → 다음 쿼리부터 즉시 0건
//   ❌ 가족(비-본인) 멤버 행                  → 동의해도 0건 (031/044 RLS 이중화)
// 대상 테이블: user_prescriptions · user_medications · medication_check_logs · profiles · members
//
// 방법: service_role(admin)로 임시 약사/약국/환자 시드 → 약사 anon 토큰으로 SELECT 실측(RLS만, 우회 없음).
//       운영 DB 사용 후 임시 리소스 전량 삭제(약국 행 포함). 실제 운영 약국·유저는 건드리지 않음.
// 실행: node --experimental-strip-types e2e/pharmacist-rls-qa.mjs
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
const iso = (ms) => new Date(ms).toISOString().split('T')[0]
const pw = () => 'E2e!' + Math.random().toString(36).slice(2) + 'Aa9'

// 정리 대상 추적
let pharmacistUid = null   // 약사 P (약국 PH1 소유)
let otherUid = null        // 약사 Q (약국 PH2 소유 — 타약국 대조)
let patientUid = null      // 환자 U
let ph1 = null, ph2 = null // 약국 id

// 약사 P 토큰으로 환자 U의 각 테이블을 SELECT해 (행수, 노출된 member_id 집합)을 돌려준다.
async function pharmacistSees(pClient, uid) {
  const rx  = await pClient.from('user_prescriptions').select('id, member_id').eq('user_id', uid)
  const med = await pClient.from('user_medications').select('id, member_id').eq('user_id', uid)
  const log = await pClient.from('medication_check_logs').select('id, member_id').eq('user_id', uid)
  const prof = await pClient.from('profiles').select('id, full_name').eq('id', uid)
  const rows = [...(rx.data ?? []), ...(med.data ?? []), ...(log.data ?? [])]
  return {
    rx: rx.data?.length ?? 0,
    med: med.data?.length ?? 0,
    log: log.data?.length ?? 0,
    profile: prof.data?.length ?? 0,
    total: rows.length,
    memberIds: new Set(rows.map(r => r.member_id)),
  }
}

try {
  // ── 시드 (admin) ────────────────────────────────────────────────
  // 1) 약사 유저 P, Q (트리거가 profiles 자동 생성)
  const pEmail = `e2e-rls-pharmacist+${now}@yaksaro-e2e.test`
  const qEmail = `e2e-rls-other+${now}@yaksaro-e2e.test`
  const pPw = pw(), qPw = pw()
  const { data: pUser, error: pErr } = await admin.auth.admin.createUser({ email: pEmail, password: pPw, email_confirm: true })
  if (pErr) throw new Error('createUser P: ' + pErr.message)
  pharmacistUid = pUser.user.id
  const { data: qUser, error: qErr } = await admin.auth.admin.createUser({ email: qEmail, password: qPw, email_confirm: true })
  if (qErr) throw new Error('createUser Q: ' + qErr.message)
  otherUid = qUser.user.id

  // 2) 약국 PH1(P 소유), PH2(Q 소유 — 타약국 대조)
  const { data: p1, error: e1 } = await admin.from('pharmacies')
    .insert({ owner_id: pharmacistUid, name: 'E2E검증약국', store_id: `E2ERLS-A-${now}` }).select('id').single()
  if (e1) throw new Error('pharmacy PH1: ' + e1.message)
  ph1 = p1.id
  const { data: p2, error: e2 } = await admin.from('pharmacies')
    .insert({ owner_id: otherUid, name: 'E2E타약국', store_id: `E2ERLS-B-${now}` }).select('id').single()
  if (e2) throw new Error('pharmacy PH2: ' + e2.message)
  ph2 = p2.id

  // 3) 환자 U + 멤버(본인/가족)
  const uEmail = `e2e-rls-patient+${now}@yaksaro-e2e.test`, uPw = pw()
  const { data: uUser, error: uErr } = await admin.auth.admin.createUser({ email: uEmail, password: uPw, email_confirm: true })
  if (uErr) throw new Error('createUser U: ' + uErr.message)
  patientUid = uUser.user.id

  const { data: existing } = await admin.from('members').select('id, is_self').eq('owner_id', patientUid)
  let selfId = (existing ?? []).find(m => m.is_self)?.id
  if (!selfId) {
    const { data: s, error } = await admin.from('members').insert({ owner_id: patientUid, name: '본인', relation: '본인', is_self: true }).select('id').single()
    if (error) throw new Error('member self: ' + error.message)
    selfId = s.id
  }
  const { data: fam, error: fErr } = await admin.from('members').insert({ owner_id: patientUid, name: '어머니', relation: '어머니', is_self: false }).select('id').single()
  if (fErr) throw new Error('member fam: ' + fErr.message)
  const famId = fam.id

  // 4) 처방/약/체크로그 — 본인 2건(처방·약 각 2) + 가족 1건 (가족 격리 검증용)
  const { data: rxSelf, error: rsErr } = await admin.from('user_prescriptions')
    .insert({ user_id: patientUid, member_id: selfId, hospital_name: '본인내과', prescribed_at: iso(now), duration_days: 30 }).select('id').single()
  if (rsErr) throw new Error('rxSelf: ' + rsErr.message)
  const { data: rxSelf2, error: rs2Err } = await admin.from('user_prescriptions')
    .insert({ user_id: patientUid, member_id: selfId, hospital_name: '본인정형외과', prescribed_at: iso(now), duration_days: 30 }).select('id').single()
  if (rs2Err) throw new Error('rxSelf2: ' + rs2Err.message)
  const { data: rxFam, error: rfErr } = await admin.from('user_prescriptions')
    .insert({ user_id: patientUid, member_id: famId, hospital_name: '가족내과', prescribed_at: iso(now), duration_days: 30 }).select('id').single()
  if (rfErr) throw new Error('rxFam: ' + rfErr.message)

  const { error: mErr } = await admin.from('user_medications').insert([
    { user_id: patientUid, member_id: selfId, prescription_id: rxSelf.id,  custom_name: '본인약A', schedule_type: 'daily', dose_amount: 1, doses_per_day: 1, total_days: 30, source: 'manual', meal_times: ['morning'] },
    { user_id: patientUid, member_id: selfId, prescription_id: rxSelf2.id, custom_name: '본인약B', schedule_type: 'daily', dose_amount: 1, doses_per_day: 1, total_days: 30, source: 'manual', meal_times: ['evening'] },
    { user_id: patientUid, member_id: famId,  prescription_id: rxFam.id,   custom_name: '가족약',  schedule_type: 'daily', dose_amount: 1, doses_per_day: 1, total_days: 30, source: 'manual', meal_times: ['morning'] },
  ])
  if (mErr) throw new Error('meds: ' + mErr.message)

  const { error: lErr } = await admin.from('medication_check_logs').insert([
    { user_id: patientUid, member_id: selfId, check_date: iso(now), meal_time: 'morning', is_checked: true },
    { user_id: patientUid, member_id: selfId, check_date: iso(now), meal_time: 'evening', is_checked: true },
    { user_id: patientUid, member_id: famId,  check_date: iso(now), meal_time: 'morning', is_checked: true },
  ])
  if (lErr) throw new Error('logs: ' + lErr.message)

  // 5) 단골 + 동의 ON (양성 대조 상태)
  const setRegular = (pharmId, consent) => admin.from('profiles').update({
    regular_pharmacy_id: pharmId,
    consent_pharmacist_view: consent,
    consent_pharmacist_view_at: consent ? new Date(now).toISOString() : null,
  }).eq('id', patientUid)
  const { error: prErr } = await setRegular(ph1, true)
  if (prErr) throw new Error('set regular+consent: ' + prErr.message)

  // ── 약사 P 로그인(anon 토큰) ────────────────────────────────────
  const pClient = createClient(URL_, ANON, { auth: { autoRefreshToken: false, persistSession: false } })
  const { error: sErr } = await pClient.auth.signInWithPassword({ email: pEmail, password: pPw })
  if (sErr) throw new Error('signIn P: ' + sErr.message)

  console.log(`\n[대상] 약사=${pEmail}\n        약국PH1=${ph1} · 타약국PH2=${ph2} · 환자U=${patientUid}\n        본인멤버=${selfId} · 가족멤버=${famId}`)

  // ── A. 양성 대조: 동의+단골+본인 → 조회 가능, 가족은 격리 ──
  console.log('\n[A] 동의 O + 단골 O')
  const a = await pharmacistSees(pClient, patientUid)
  check('본인 처방 2건 조회됨', a.rx === 2, `rx=${a.rx}`)
  check('본인 약 2건 조회됨', a.med === 2, `med=${a.med}`)
  check('본인 체크로그 2건 조회됨', a.log === 2, `log=${a.log}`)
  check('동의 환자 profile 조회됨', a.profile === 1, `profile=${a.profile}`)
  check('★가족(비-본인) 멤버 행 0건 — 노출된 member_id에 famId 없음', !a.memberIds.has(famId), `memberIds=${[...a.memberIds].join(',')}`)
  const membersSelf = await pClient.from('members').select('id, is_self').eq('owner_id', patientUid)
  check('members: 본인(is_self)만 노출, 가족 미노출', (membersSelf.data ?? []).every(m => m.is_self) && (membersSelf.data ?? []).length >= 1, `rows=${membersSelf.data?.length ?? 0}`)

  // ── B. 미동의: consent=false → 전 테이블 0건 ──
  console.log('\n[B] 미동의(consent=false)')
  await setRegular(ph1, false)
  const b = await pharmacistSees(pClient, patientUid)
  check('미동의 → 처방 0건', b.rx === 0, `rx=${b.rx}`)
  check('미동의 → 약 0건', b.med === 0, `med=${b.med}`)
  check('미동의 → 체크로그 0건', b.log === 0, `log=${b.log}`)
  check('미동의 → profile 0건(환자 식별정보 미노출)', b.profile === 0, `profile=${b.profile}`)
  check('미동의 → members 0건', (await pClient.from('members').select('id').eq('owner_id', patientUid)).data?.length === 0)

  // ── C. 타약국: 다른 약국(PH2)의 단골 + 동의 O → P는 0건 ──
  console.log('\n[C] 타약국(PH2 단골) + 동의 O')
  await setRegular(ph2, true)
  const c = await pharmacistSees(pClient, patientUid)
  check('타약국 → 처방 0건', c.rx === 0, `rx=${c.rx}`)
  check('타약국 → 약 0건', c.med === 0, `med=${c.med}`)
  check('타약국 → 체크로그 0건', c.log === 0, `log=${c.log}`)
  check('타약국 → profile 0건', c.profile === 0, `profile=${c.profile}`)

  // ── D. 동의 철회: 다시 PH1 단골+동의 O로 열었다가 철회 → 즉시 0건 ──
  console.log('\n[D] 철회(단골 PH1, 동의 true→false)')
  await setRegular(ph1, true)
  const dOpen = await pharmacistSees(pClient, patientUid)
  check('철회 전(동의 O) → 조회 열림(양성 재확인)', dOpen.rx === 2, `rx=${dOpen.rx}`)
  await admin.from('profiles').update({ consent_pharmacist_view: false, consent_pharmacist_view_at: null }).eq('id', patientUid)
  const dRevoked = await pharmacistSees(pClient, patientUid)
  check('철회 직후 → 처방 0건(즉시 차단)', dRevoked.rx === 0, `rx=${dRevoked.rx}`)
  check('철회 직후 → 약 0건', dRevoked.med === 0, `med=${dRevoked.med}`)
  check('철회 직후 → 체크로그 0건', dRevoked.log === 0, `log=${dRevoked.log}`)

  // ── E. 쓰기 차단: 약사는 SELECT 전용 — 환자 처방 UPDATE 시도는 0행 영향(RLS) ──
  console.log('\n[E] 약사 쓰기 차단(SELECT 전용)')
  await setRegular(ph1, true) // 읽기는 열어둔 상태에서도 쓰기는 막혀야 함
  const wr = await pClient.from('user_prescriptions').update({ hospital_name: '약사가조작' }).eq('id', rxSelf.id).select('id')
  check('약사 토큰 UPDATE → 0행 영향(쓰기 정책 없음)', (wr.data?.length ?? 0) === 0, `updated=${wr.data?.length ?? 0}${wr.error ? ' err=' + wr.error.message : ''}`)
  const verify = await admin.from('user_prescriptions').select('hospital_name').eq('id', rxSelf.id).single()
  check('원본 처방 병원명 불변(조작 실패 확인)', verify.data?.hospital_name === '본인내과', `got=${verify.data?.hospital_name}`)
} catch (e) {
  check('예외 없이 완주: ' + (e?.message ?? e), false)
} finally {
  // 약국 → 유저 순서로 삭제(pharmacies.owner_id가 profiles를 참조하므로 약국 먼저)
  if (ph1) await admin.from('pharmacies').delete().eq('id', ph1)
  if (ph2) await admin.from('pharmacies').delete().eq('id', ph2)
  if (patientUid) { await admin.from('members').delete().eq('owner_id', patientUid); await admin.auth.admin.deleteUser(patientUid) }
  if (pharmacistUid) await admin.auth.admin.deleteUser(pharmacistUid)
  if (otherUid) await admin.auth.admin.deleteUser(otherUid)
  console.log('\n[정리] 임시 약사·약국·환자 삭제 완료 (운영 데이터 불변)')
}

const passed = results.filter(r => r.pass).length
const failed = results.length - passed
console.log(`\n===== 약사 토큰 RLS 누수 실측: ${passed}/${results.length} PASS, ${failed} FAIL =====`)
if (failed > 0) { console.log('실패:', results.filter(r => !r.pass).map(r => r.name).join(' | ')); process.exit(1) }
