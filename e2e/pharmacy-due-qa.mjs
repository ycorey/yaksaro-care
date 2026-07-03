// 약사 요청 마감(due_date) 권한 시나리오 — 트리거 레벨 e2e.
// 약사(약국 owner)는 due_date 변경 가능, 환자는 불가(트리거 pin), 환자 취소는 정상(pin은 컬럼 특정).
// 운영 Supabase에 임시 유저/약국/요청 생성 → 검증 → finally 전량 삭제. Next 서버 불필요.
// 실행: node e2e/pharmacy-due-qa.mjs
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
const pharmEmail = `e2e-due-ph+${now}@yaksaro-e2e.test`
const patEmail = `e2e-due-pt+${now}@yaksaro-e2e.test`

let pharmUid = null, patUid = null, pharmacyId = null, reqId = null

async function signedClient(email, password) {
  const c = createClient(URL_, ANON, { auth: { autoRefreshToken: false, persistSession: false } })
  const { error } = await c.auth.signInWithPassword({ email, password })
  if (error) throw new Error('signIn ' + email + ': ' + error.message)
  return c
}
async function dbRow() {
  const { data } = await admin.from('pharmacy_requests').select('due_date, status').eq('id', reqId).single()
  return data
}

try {
  const { data: ph, error: e1 } = await admin.auth.admin.createUser({ email: pharmEmail, password: pw, email_confirm: true })
  if (e1) throw new Error('createUser 약사: ' + e1.message)
  pharmUid = ph.user.id
  const { data: pt, error: e2 } = await admin.auth.admin.createUser({ email: patEmail, password: pw, email_confirm: true })
  if (e2) throw new Error('createUser 환자: ' + e2.message)
  patUid = pt.user.id
  const { data: phc, error: e3 } = await admin.from('pharmacies')
    .insert({ owner_id: pharmUid, name: 'E2E마감테스트약국', store_id: `e2e-due-${now}` })
    .select('id').single()
  if (e3) throw new Error('pharmacy insert: ' + e3.message)
  pharmacyId = phc.id
  const { data: rq, error: e4 } = await admin.from('pharmacy_requests')
    .insert({ patient_id: patUid, pharmacy_id: pharmacyId, type: 'pickup', due_date: '2026-07-03', status: 'open' })
    .select('id').single()
  if (e4) throw new Error('request insert: ' + e4.message)
  reqId = rq.id
  console.log(`\n[준비] 약사=${pharmUid} 환자=${patUid} 약국=${pharmacyId} 요청=${reqId}`)

  // T1: 약사(약국 owner)가 due_date 변경 → 허용
  console.log('\n[T1] 약사 마감 변경 허용')
  const pharmC = await signedClient(pharmEmail, pw)
  const { error: uErr } = await pharmC.from('pharmacy_requests').update({ due_date: '2099-12-31' }).eq('id', reqId)
  check('약사 UPDATE 에러 없음', !uErr, uErr?.message || '')
  check('DB due_date = 2099-12-31 (약사 변경 반영)', (await dbRow())?.due_date === '2099-12-31')

  // T2: 환자가 due_date 변경 시도 → 트리거가 OLD로 고정(무효)
  console.log('\n[T2] 환자 마감 변조 차단')
  const patC = await signedClient(patEmail, pw)
  await patC.from('pharmacy_requests').update({ due_date: '2000-01-01' }).eq('id', reqId)
  check('환자 변조 후에도 due_date = 2099-12-31 (트리거 pin)', (await dbRow())?.due_date === '2099-12-31')

  // T3: 환자 취소는 정상(pin이 컬럼 특정임을 증명)
  console.log('\n[T3] 환자 허용 동작(취소)은 정상')
  await patC.from('pharmacy_requests').update({ status: 'canceled' }).eq('id', reqId)
  const after = await dbRow()
  check('환자 취소 반영(status=canceled)', after?.status === 'canceled')
  check('취소 후에도 due_date 유지 = 2099-12-31', after?.due_date === '2099-12-31')
} catch (e) {
  check('예외 없이 완주: ' + (e?.message ?? e), false)
} finally {
  if (reqId) await admin.from('pharmacy_requests').delete().eq('id', reqId)
  if (pharmacyId) await admin.from('pharmacies').delete().eq('id', pharmacyId)
  if (pharmUid) await admin.auth.admin.deleteUser(pharmUid)
  if (patUid) await admin.auth.admin.deleteUser(patUid)
  console.log('\n[정리] 임시 유저·약국·요청 삭제 완료')
}

const passed = results.filter(r => r.pass).length
const failed = results.length - passed
console.log(`\n===== 마감 권한 시나리오: ${passed}/${results.length} PASS, ${failed} FAIL =====`)
if (failed > 0) { console.log('실패:', results.filter(r => !r.pass).map(r => r.name).join(' | ')); process.exit(1) }
