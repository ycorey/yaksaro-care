// 문구 QA 시드 — 화면에 있는 **문구 분기 전부**가 실제로 렌더되도록 상태를 넓게 깐다.
// 스토어 시드(store-assets)가 "보기 좋은" 한 상태라면, 이건 "가능한 모든 상태" 다.
//   환자: 본인 + 가족(어머니) · 매일/필요시/주2회/직접입력/일반약/영양제/복용종료/리필임박 ·
//         복약기록 21일 · 단골약국 연결 + 약사 열람 동의 · 약국 요청 1건
//   약사: 약국 소유자 계정(대시보드·환자 상세 렌더용)
// 산출: scripts/copy-qa/.auth/{patient,pharmacist}.json(Playwright storageState) · creds.json
// 정리: node scripts/copy-qa/teardown.mjs
import { writeFileSync, mkdirSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { loadEnv } from '../../e2e/_env.mjs'
import { consentedPatientMeta } from '../../e2e/_seed-meta.mjs'

const { URL_, ANON, SERVICE } = loadEnv()
const admin = createClient(URL_, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } })
const now = Date.now()
const iso = (ms) => new Date(ms).toISOString().split('T')[0]
const daysAgo = (n) => new Date(now - n * 86_400_000).toISOString()
const pw = () => 'Qa!' + Math.random().toString(36).slice(2) + 'Aa9'
const must = (label, r) => { if (r.error) throw new Error(label + ': ' + r.error.message); return r.data }

async function findDrug(q) {
  const d = must('drugs ' + q, await admin.from('drugs').select('id, item_name').ilike('item_name', `%${q}%`).limit(1))
  if (!d?.length) console.log('  ⚠ 못 찾음: ' + q)
  return d?.[0] ?? null
}
async function findSupp(q) {
  const d = must('supp ' + q, await admin.from('supplements').select('id, product_name').ilike('product_name', `%${q}%`).limit(1))
  return d?.[0] ?? null
}
async function sessionState(email, password) {
  let captured = []
  const ssr = createServerClient(URL_, ANON, { cookies: { getAll: () => [], setAll: (a) => { captured = a } } })
  const { error } = await ssr.auth.signInWithPassword({ email, password })
  if (error) throw new Error('signIn ' + email + ': ' + error.message)
  const sec = Math.floor(now / 1000)
  return {
    cookies: captured.map(c => ({
      name: c.name, value: c.value, domain: 'localhost', path: c.options?.path || '/',
      expires: c.options?.maxAge ? sec + c.options.maxAge : sec + 3600,
      httpOnly: false, secure: false, sameSite: 'Lax',
    })),
    origins: [],
  }
}

// ── 약사 + 약국 ──────────────────────────────────────────────
const phEmail = `copyqa-pharmacist+${now}@yaksaro-e2e.test`
const phPw = pw()
const phUser = must('createUser 약사', await admin.auth.admin.createUser({ email: phEmail, password: phPw, email_confirm: true }))
const pharmacistUid = phUser.user.id
must('role', await admin.from('profiles').update({ role: 'pharmacist', full_name: '박약사' }).eq('id', pharmacistUid))
const storeId = `QAQA${String(now).slice(-6)}`
const pharmacy = must('pharmacies', await admin.from('pharmacies')
  .insert({ owner_id: pharmacistUid, name: '우리동네약국', store_id: storeId, phone: '02-000-0000' })
  .select('id').single())

// ── 환자 ─────────────────────────────────────────────────────
const paEmail = `copyqa-patient+${now}@yaksaro-e2e.test`
const paPw = pw()
const paUser = must('createUser 환자', await admin.auth.admin.createUser({
  email: paEmail, password: paPw, email_confirm: true, user_metadata: consentedPatientMeta(),
}))
const uid = paUser.user.id
must('profile', await admin.from('profiles').update({
  // regular_pharmacy_name 도 채운다 — pharmacies 는 소유자만 읽을 수 있어(021) 환자 화면은 이 비정규화
  // 컬럼으로 연결 여부를 그린다. 실제 링크 경로(set-pharmacy·regular-pharmacy.ts)가 그렇게 쓴다.
  full_name: '김영희', regular_pharmacy_id: pharmacy.id, regular_pharmacy_name: '우리동네약국',
  consent_pharmacist_view: true, consent_pharmacist_view_at: new Date().toISOString(),
}).eq('id', uid))

const existing = must('members', await admin.from('members').select('id, is_self').eq('owner_id', uid))
let selfId = (existing ?? []).find(m => m.is_self)?.id
if (!selfId) {
  selfId = must('self', await admin.from('members')
    .insert({ owner_id: uid, name: '본인', relation: '본인', is_self: true }).select('id').single()).id
}
const momId = must('mom', await admin.from('members')
  .insert({ owner_id: uid, name: '어머니', relation: '어머니', is_self: false }).select('id').single()).id

console.log('[drugs]')
const amo = await findDrug('아모잘탄')
const cre = await findDrug('크레스토')
const jan = await findDrug('자누비아')
const tyl = await findDrug('타이레놀')
const fos = await findDrug('포사맥스')
const ari = await findDrug('아리셉트')
const omg = await findSupp('오메가')
const vd  = await findSupp('비타민D')

// 처방 A — 6일 전, 30일 (진행 중)
const rxA = must('rxA', await admin.from('user_prescriptions').insert({
  user_id: uid, member_id: selfId, hospital_name: '한마음내과의원', department: '내과',
  pharmacy_name: '우리동네약국', pharmacy_phone: '02-000-0000',
  prescribed_at: iso(now - 6 * 86_400_000), duration_days: 30,
}).select('id').single())
// 처방 B — 27일 전, 30일 (리필 임박)
const rxB = must('rxB', await admin.from('user_prescriptions').insert({
  user_id: uid, member_id: selfId, hospital_name: '연세정형외과', department: '정형외과',
  prescribed_at: iso(now - 27 * 86_400_000), duration_days: 30,
}).select('id').single())
// 처방 C — 어머니
const rxC = must('rxC', await admin.from('user_prescriptions').insert({
  user_id: uid, member_id: momId, hospital_name: '서울신경과의원', department: '신경과',
  prescribed_at: iso(now - 3 * 86_400_000), duration_days: 28,
}).select('id').single())

const rows = []
const base = (m, extra) => ({ user_id: uid, member_id: m, source: 'manual', created_at: daysAgo(6), ...extra })
if (amo) rows.push(base(selfId, { prescription_id: rxA.id, drug_id: amo.id, schedule_type: 'daily', dose_amount: 1, doses_per_day: 1, total_days: 30, meal_times: ['morning'], source: 'ocr' }))
if (cre) rows.push(base(selfId, { prescription_id: rxA.id, drug_id: cre.id, schedule_type: 'daily', dose_amount: 1, doses_per_day: 2, total_days: 30, meal_times: ['morning', 'evening'], source: 'ocr' }))
if (jan) rows.push(base(selfId, { prescription_id: rxA.id, drug_id: jan.id, schedule_type: 'prn', doses_per_day: 1, total_days: 30, meal_times: [], source: 'ocr' }))
if (fos) rows.push(base(selfId, { prescription_id: rxB.id, drug_id: fos.id, schedule_type: 'weekly', dow: [1, 4], dose_amount: 1, doses_per_day: 1, total_days: 30, meal_times: ['morning'], created_at: daysAgo(27) }))
rows.push(base(selfId, { prescription_id: rxB.id, custom_name: '관절 연골약(병원 조제)', schedule_type: 'daily', dose_amount: 2, doses_per_day: 3, total_days: 30, meal_times: ['morning', 'afternoon', 'evening'], created_at: daysAgo(27) }))
if (tyl) rows.push(base(selfId, { drug_id: tyl.id, schedule_type: 'prn', doses_per_day: 1, meal_times: [] }))
if (omg) rows.push(base(selfId, { supplement_id: omg.id, schedule_type: 'daily', dose_amount: 1, doses_per_day: 1, total_days: 90, meal_times: ['morning'] }))
if (vd)  rows.push(base(selfId, { supplement_id: vd.id, schedule_type: 'daily', dose_amount: 0.5, doses_per_day: 1, total_days: 90, meal_times: ['bedtime'] }))
// 복용 종료(지난 약)
rows.push(base(selfId, { custom_name: '감기약(종료)', schedule_type: 'daily', dose_amount: 1, doses_per_day: 3, total_days: 5, meal_times: ['morning', 'afternoon', 'evening'], created_at: daysAgo(20), ended_at: iso(now - 14 * 86_400_000) }))
// 어머니
if (ari) rows.push(base(momId, { prescription_id: rxC.id, drug_id: ari.id, schedule_type: 'daily', dose_amount: 1, doses_per_day: 1, total_days: 28, meal_times: ['bedtime'], created_at: daysAgo(3) }))
must('meds', await admin.from('user_medications').insert(rows))

// 복약 기록 21일 + 오늘 아침 체크
const logs = []
for (let i = 1; i <= 21; i++) {
  for (const m of ['morning', 'evening']) {
    if (i % 5 === 2 && m === 'evening') continue
    logs.push({ user_id: uid, member_id: selfId, check_date: iso(now - i * 86_400_000), meal_time: m, is_checked: true, logged_at: daysAgo(i) })
  }
}
const checkedAt = new Date(new Date(now).setHours(8, 0, 0, 0)).toISOString()
logs.push({ user_id: uid, member_id: selfId, check_date: iso(now), meal_time: 'morning', is_checked: true, logged_at: checkedAt })
must('logs', await admin.from('medication_check_logs').insert(logs))
must('sched', await admin.from('medication_schedules').insert({
  user_id: uid, member_id: selfId, check_date: iso(now), meal_time: 'morning', is_checked: true, updated_at: checkedAt,
}))

// 약국 요청 1건(열림)
must('request', await admin.from('pharmacy_requests').insert({
  patient_id: uid, pharmacy_id: pharmacy.id, member_id: null, type: 'dispense_prep',
  note: '[준비 약] 아모잘탄정, 크레스토정 · 내일 오전에 찾으러 갈게요', due_date: iso(now),
}))

// ── 세션 ─────────────────────────────────────────────────────
mkdirSync(new URL('./.auth/', import.meta.url), { recursive: true })
writeFileSync(new URL('./.auth/patient.json', import.meta.url), JSON.stringify(await sessionState(paEmail, paPw), null, 2))
writeFileSync(new URL('./.auth/pharmacist.json', import.meta.url), JSON.stringify(await sessionState(phEmail, phPw), null, 2))
writeFileSync(new URL('./.auth/creds.json', import.meta.url), JSON.stringify({ uid, pharmacistUid, pharmacyId: pharmacy.id, storeId, selfId, momId }, null, 2))
console.log(`\nCOPYQA_SEED_OK 환자=${uid} 약사=${pharmacistUid} store=${storeId} 약=${rows.length}건 기록=${logs.length}행`)
