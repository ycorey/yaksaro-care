// E2E 셋업: 운영 Supabase에 임시 확인된 테스트 유저 생성 + 최소 시드 + 세션쿠키 캡처.
// 세션쿠키는 @supabase/ssr가 직접 생성(setAll 캡처) → 청킹/포맷 역설계 불필요.
// 산출물: e2e/.auth/state.json(Playwright storageState), e2e/.auth/creds.json(정리용 uid).
import { writeFileSync, mkdirSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { loadEnv } from './_env.mjs'

const { URL_, ANON, SERVICE } = loadEnv()
const admin = createClient(URL_, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } })

const iso = (ms) => new Date(ms).toISOString().split('T')[0]
const now = Date.now()
const email = `e2e-test+${now}@yaksaro-e2e.test`
const password = 'E2e!' + Math.random().toString(36).slice(2) + 'Aa9'

// 1) 확인된 유저 생성
const { data: created, error: cErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
if (cErr) throw new Error('createUser: ' + cErr.message)
const uid = created.user.id

// 2) 멤버 — 본인(트리거가 미리 만들었으면 재사용) + 가족
const { data: existing } = await admin.from('members').select('id, is_self').eq('owner_id', uid)
let selfId = (existing ?? []).find(m => m.is_self)?.id
if (!selfId) {
  const { data: s, error } = await admin.from('members').insert({ owner_id: uid, name: '본인', relation: '본인', is_self: true }).select('id').single()
  if (error) throw new Error('member self: ' + error.message)
  selfId = s.id
}
const { data: fam, error: fErr } = await admin.from('members').insert({ owner_id: uid, name: '어머니', relation: '어머니', is_self: false }).select('id').single()
if (fErr) throw new Error('member fam: ' + fErr.message)
const famId = fam.id

// 3) 처방 A — 전부 PRN(필요시): 끼니버튼이 안 떠야 함
const { data: rxPrn, error: pErr } = await admin.from('user_prescriptions')
  .insert({ user_id: uid, member_id: selfId, hospital_name: 'PRN내과의원', prescribed_at: iso(now), duration_days: 30 })
  .select('id').single()
if (pErr) throw new Error('rxPrn: ' + pErr.message)
// 4) 처방 B — 매일 + 아침/저녁: 끼니버튼 2개가 떠야 함(대조군)
const { data: rxDaily, error: dErr } = await admin.from('user_prescriptions')
  .insert({ user_id: uid, member_id: selfId, hospital_name: '매일정형외과', prescribed_at: iso(now), duration_days: 30 })
  .select('id').single()
if (dErr) throw new Error('rxDaily: ' + dErr.message)

const { error: mErr } = await admin.from('user_medications').insert([
  { user_id: uid, member_id: selfId, prescription_id: rxPrn.id,   custom_name: '리브가PRN',   schedule_type: 'prn',   doses_per_day: 1, total_days: 30, source: 'manual', meal_times: [] },
  { user_id: uid, member_id: selfId, prescription_id: rxPrn.id,   custom_name: '토파맥스PRN', schedule_type: 'prn',   total_days: 30, source: 'manual', meal_times: [] },
  { user_id: uid, member_id: selfId, prescription_id: rxDaily.id, custom_name: '매일약A',     schedule_type: 'daily', dose_amount: 1, doses_per_day: 2, total_days: 30, source: 'manual', meal_times: ['morning', 'evening'] },
])
if (mErr) throw new Error('meds: ' + mErr.message)

// 5) 복약 체크로그 — 본인 최근 14일(요일별 0~3끼니) + 가족 3일(리포트/캘린더에 안 섞여야 함)
const meals = ['morning', 'afternoon', 'evening', 'bedtime']
const logs = []
let selfCheckedSlots = 0
for (let i = 0; i < 14; i++) {
  const dstr = iso(now - i * 86_400_000)
  const done = i % 4 // 0,1,2,3,0,...
  for (let j = 0; j < done; j++) { logs.push({ user_id: uid, member_id: selfId, check_date: dstr, meal_time: meals[j], is_checked: true }); selfCheckedSlots++ }
}
for (let i = 0; i < 3; i++) logs.push({ user_id: uid, member_id: famId, check_date: iso(now - i * 86_400_000), meal_time: 'morning', is_checked: true })
const { error: lErr } = await admin.from('medication_check_logs').insert(logs)
if (lErr) throw new Error('logs: ' + lErr.message)

// 6) 세션쿠키 캡처 (@supabase/ssr가 setAll로 정확한 쿠키를 생성)
let captured = []
const ssr = createServerClient(URL_, ANON, { cookies: { getAll: () => [], setAll: (arr) => { captured = arr } } })
const { error: sErr } = await ssr.auth.signInWithPassword({ email, password })
if (sErr) throw new Error('signIn: ' + sErr.message)
if (captured.length === 0) throw new Error('세션 쿠키 캡처 실패(setAll 미호출)')

const nowSec = Math.floor(now / 1000)
const cookies = captured.map(c => ({
  name: c.name,
  value: c.value,
  domain: 'localhost',
  path: c.options?.path || '/',
  expires: c.options?.maxAge ? nowSec + c.options.maxAge : nowSec + 3600,
  httpOnly: false,
  secure: false,
  sameSite: 'Lax',
}))

mkdirSync(new URL('./.auth/', import.meta.url), { recursive: true })
writeFileSync(new URL('./.auth/state.json', import.meta.url), JSON.stringify({ cookies, origins: [] }, null, 2))
writeFileSync(new URL('./.auth/creds.json', import.meta.url), JSON.stringify({ userId: uid, email, selfId, famId, selfCheckedSlots }, null, 2))

console.log(`SEED_OK uid=${uid}`)
console.log(`  email=${email}`)
console.log(`  cookies=${cookies.length} selfLogs(checked slots)=${selfCheckedSlots} famLogs=3`)
console.log(`  prescriptions: PRN(2 meds) + daily(1 med, 아침/저녁)`)
