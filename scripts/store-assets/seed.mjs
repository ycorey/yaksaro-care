// 스토어 자산용 시드 — Play 스크린샷에 쓸 "보기 좋은" 시연 계정을 운영 DB에 임시로 만든다.
//
// e2e/setup.mjs 와 목적이 다르다. 저쪽은 규칙을 검증하려고 '리브가PRN' 같은 식별용 문자열을
// 쓰지만, 스토어 스크린샷은 사람이 보는 물건이라 **실제 약품 마스터의 진짜 약**이 붙어야 한다
// (약품명·제조사·낱알 이미지가 drugs 조인으로 렌더된다 — @wallet/default.tsx).
//
// 산출물: scripts/store-assets/.auth/{state.json,creds.json}
// 정리:   node scripts/store-assets/teardown.mjs   ← 촬영 끝나면 반드시 실행
import { writeFileSync, mkdirSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { loadEnv } from '../../e2e/_env.mjs'
import { consentedPatientMeta } from '../../e2e/_seed-meta.mjs'

const { URL_, ANON, SERVICE } = loadEnv()
const admin = createClient(URL_, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } })

const iso = (ms) => new Date(ms).toISOString().split('T')[0]
const now = Date.now()
const email = `store-shot+${now}@yaksaro-e2e.test`
const password = 'Shot!' + Math.random().toString(36).slice(2) + 'Aa9'

// ── 1) 계정 ───────────────────────────────────────────────
const { data: created, error: cErr } = await admin.auth.admin.createUser({
  email, password, email_confirm: true, user_metadata: consentedPatientMeta(),
})
if (cErr) throw new Error('createUser: ' + cErr.message)
const uid = created.user.id

const { data: existing } = await admin.from('members').select('id, is_self').eq('owner_id', uid)
let selfId = (existing ?? []).find(m => m.is_self)?.id
if (!selfId) {
  const { data: s, error } = await admin.from('members')
    .insert({ owner_id: uid, name: '본인', relation: '본인', is_self: true }).select('id').single()
  if (error) throw new Error('member self: ' + error.message)
  selfId = s.id
}

// ── 2) 실제 약품 찾기 ─────────────────────────────────────
// 마스터에 있는 것만 붙인다. 못 찾으면 그 자리는 비우고 로그로 알린다 —
// custom_name 으로 때우면 제조사·낱알 이미지가 빠져 카드가 초라해진다.
async function findDrug(q) {
  const { data, error } = await admin.from('drugs')
    .select('id, item_name, entp_name').ilike('item_name', `%${q}%`).limit(1)
  if (error) throw new Error(`drugs(${q}): ` + error.message)
  if (!data?.length) { console.log(`  ⚠ 못 찾음: ${q}`); return null }
  console.log(`  ✓ ${data[0].item_name} (${data[0].entp_name ?? '-'})`)
  return data[0]
}
async function findSupplement(q) {
  const { data, error } = await admin.from('supplements')
    .select('id, product_name').ilike('product_name', `%${q}%`).limit(1)
  if (error) throw new Error(`supplements(${q}): ` + error.message)
  if (!data?.length) { console.log(`  ⚠ 못 찾음(건기식): ${q}`); return null }
  console.log(`  ✓ ${data[0].product_name}`)
  return data[0]
}

console.log('[drugs] 마스터 조회')
const rxPicks   = [await findDrug('아모잘탄'), await findDrug('크레스토'), await findDrug('자누비아')]
const otcPick   = await findDrug('타이레놀')
console.log('[supplements] 마스터 조회')
const suppPicks = [await findSupplement('오메가'), await findSupplement('비타민D')]

// ── 3) 처방 ───────────────────────────────────────────────
const { data: rx, error: pErr } = await admin.from('user_prescriptions').insert({
  user_id: uid, member_id: selfId,
  hospital_name: '한마음내과의원', department: '내과',
  pharmacy_name: '우리동네약국', pharmacy_phone: '02-000-0000',
  prescribed_at: iso(now - 6 * 86_400_000), duration_days: 30,
}).select('id').single()
if (pErr) throw new Error('prescription: ' + pErr.message)

const seededAt = new Date(now - 6 * 86_400_000).toISOString()
const rxRows = rxPicks.filter(Boolean).map((d, i) => ({
  user_id: uid, member_id: selfId, prescription_id: rx.id, drug_id: d.id,
  schedule_type: 'daily', dose_amount: 1, doses_per_day: i === 0 ? 1 : 2, total_days: 30,
  source: 'ocr', meal_times: i === 0 ? ['morning'] : ['morning', 'evening'], created_at: seededAt,
}))
const otcRows = otcPick ? [{
  user_id: uid, member_id: selfId, drug_id: otcPick.id,
  schedule_type: 'prn', doses_per_day: 1, source: 'manual', meal_times: [], created_at: seededAt,
}] : []
const suppRows = suppPicks.filter(Boolean).map(s => ({
  user_id: uid, member_id: selfId, supplement_id: s.id,
  schedule_type: 'daily', dose_amount: 1, doses_per_day: 1, total_days: 90,
  source: 'manual', meal_times: ['morning'], created_at: seededAt,
}))

const { error: mErr } = await admin.from('user_medications').insert([...rxRows, ...otcRows, ...suppRows])
if (mErr) throw new Error('meds: ' + mErr.message)

// ── 4) 복약 기록 — 캘린더·리포트가 비어 보이지 않게 21일치 ────
// 100% 로 채우지 않는다. 전부 초록이면 캘린더가 단색이 되어 기능이 안 읽힌다.
const meals = ['morning', 'evening']
const logs = []
for (let i = 1; i <= 21; i++) {
  const dstr = iso(now - i * 86_400_000)
  for (const m of meals) {
    if (i % 7 === 3 && m === 'evening') continue   // 군데군데 빠뜨려 실제감을 준다
    logs.push({ user_id: uid, member_id: selfId, check_date: dstr, meal_time: m, is_checked: true })
  }
}
const { error: lErr } = await admin.from('medication_check_logs').insert(logs)
if (lErr) throw new Error('logs: ' + lErr.message)

// 오늘 — 아침만 체크됨(저녁 미체크 상태가 "오늘 할 일"을 보여준다)
// updated_at 이 곧 "오전 8:00 복용" 의 출처다(@today/default.tsx — 체크 여부와 같은 행에서 읽는다).
// 비우면 DEFAULT now() 라 촬영 시각이 찍혀 아침 슬롯과 어긋나 보인다.
const checkedAt = new Date(new Date(now).setHours(8, 0, 0, 0)).toISOString()
const { error: sErr2 } = await admin.from('medication_schedules').insert({
  user_id: uid, member_id: selfId, check_date: iso(now), meal_time: 'morning', is_checked: true,
  updated_at: checkedAt,
})
if (sErr2) throw new Error('medication_schedules: ' + sErr2.message)

// 오늘 체크 시각 — **`medication_check_logs` 에만** logged_at 이 있다(007). `medication_schedules`
// 에 넣으면 42703 으로 조용히 실패한다(2026-09-05 실측). 오늘 복약 카드는 schedules 로 체크 여부를,
// check_logs 의 logged_at 으로 "오전 8:00 복용" 문구를 만든다(@today/default.tsx:52·62).
const { error: tErr } = await admin.from('medication_check_logs').insert({
  user_id: uid, member_id: selfId, check_date: iso(now), meal_time: 'morning', is_checked: true,
  logged_at: checkedAt,
})
if (tErr) throw new Error('오늘 check_log: ' + tErr.message)

// ── 5) 세션 쿠키 캡처 ─────────────────────────────────────
let captured = []
const ssr = createServerClient(URL_, ANON, { cookies: { getAll: () => [], setAll: (arr) => { captured = arr } } })
const { error: signErr } = await ssr.auth.signInWithPassword({ email, password })
if (signErr) throw new Error('signIn: ' + signErr.message)
if (captured.length === 0) throw new Error('세션 쿠키 캡처 실패(setAll 미호출)')

const nowSec = Math.floor(now / 1000)
const cookies = captured.map(c => ({
  name: c.name, value: c.value, domain: 'localhost', path: c.options?.path || '/',
  expires: c.options?.maxAge ? nowSec + c.options.maxAge : nowSec + 3600,
  httpOnly: false, secure: false, sameSite: 'Lax',
}))

mkdirSync(new URL('./.auth/', import.meta.url), { recursive: true })
writeFileSync(new URL('./.auth/state.json', import.meta.url), JSON.stringify({ cookies, origins: [] }, null, 2))
writeFileSync(new URL('./.auth/creds.json', import.meta.url), JSON.stringify({ userId: uid, email, selfId }, null, 2))

console.log(`\nSTORE_SEED_OK uid=${uid}`)
console.log(`  처방 ${rxRows.length}건 · 일반약 ${otcRows.length}건 · 건기식 ${suppRows.length}건 · 복약기록 ${logs.length}행`)
console.log(`  촬영 끝나면: node scripts/store-assets/teardown.mjs`)
