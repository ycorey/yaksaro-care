// Play 심사자 계정 — 운영 DB에 **상시 유지되는** 이메일+비밀번호 환자 계정을 만든다.
//
// 왜 필요한가: 환자 로그인이 구글·카카오뿐이면 심사자가 앱에 들어올 수단이 없어 리젝된다.
// 입구(`/login` → [이메일로 로그인])는 2026-08-31 에 만들었지만 **자력 가입이 없어** 계정은
// 관리자가 발급해야 한다. store-assets/seed.mjs 와 달리 teardown 하지 않는다 — 심사는 출시 후
// 업데이트마다 다시 오므로 계정이 살아 있어야 한다.
//
// 동의는 미리 찍지 않는다(consentedPatientMeta 미사용). 심사자가 로그인 화면의 [필수] 체크로
// §23 동의를 직접 지나가게 해, 처리방침 제4조 "별도의 동의를 받습니다" 를 눈으로 확인하게 한다.
// 약은 미리 넣어 둔다 — 빈 지갑은 심사자에게 기능이 안 읽힌다.
//
// 멱등: 있으면 비밀번호만 재발급한다(약은 없을 때만 시드).
// 산출물: _workspace/play/reviewer-account.txt (gitignore — 비밀번호 포함)
// 실행: node scripts/play-reviewer-account.mjs
import { writeFileSync, mkdirSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { loadEnv } from '../e2e/_env.mjs'

const EMAIL = 'play-reviewer@yaksaro.co.kr'
const { URL_, SERVICE } = loadEnv()
const admin = createClient(URL_, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } })

// 영문 대소문자+숫자+기호 — 심사자가 손으로 옮겨 적으므로 헷갈리는 글자(0/O, 1/l/I)는 뺀다
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
const password = 'Review!' + [...randomBytes(10)].map(b => ALPHA[b % ALPHA.length]).join('') + '7a'

// ── 1) 계정 ───────────────────────────────────────────────
async function findUser(email) {
  for (let page = 1; page < 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw new Error('listUsers: ' + error.message)
    const hit = data.users.find(u => u.email === email)
    if (hit) return hit
    if (data.users.length < 200) return null
  }
  return null
}

let uid
const existing = await findUser(EMAIL)
if (existing) {
  uid = existing.id
  const { error } = await admin.auth.admin.updateUserById(uid, { password, email_confirm: true })
  if (error) throw new Error('updateUser: ' + error.message)
  console.log(`기존 계정 비밀번호 재발급: ${uid}`)
} else {
  const { data, error } = await admin.auth.admin.createUser({ email: EMAIL, password, email_confirm: true })
  if (error) throw new Error('createUser: ' + error.message)
  uid = data.user.id
  console.log(`새 계정 생성: ${uid}`)
}

// ── 2) 본인 member ────────────────────────────────────────
const { data: mem } = await admin.from('members').select('id, is_self').eq('owner_id', uid)
let selfId = (mem ?? []).find(m => m.is_self)?.id
if (!selfId) {
  const { data: s, error } = await admin.from('members')
    .insert({ owner_id: uid, name: '본인', relation: '본인', is_self: true }).select('id').single()
  if (error) throw new Error('member self: ' + error.message)
  selfId = s.id
}

// ── 3) 약 — 없을 때만 ─────────────────────────────────────
const { count } = await admin.from('user_medications').select('id', { count: 'exact', head: true }).eq('user_id', uid)
if (!count) {
  const findDrug = async (q) => {
    const { data } = await admin.from('drugs').select('id, item_name').ilike('item_name', `%${q}%`).limit(1)
    if (!data?.length) console.log(`  ⚠ 못 찾음: ${q}`)
    return data?.[0] ?? null
  }
  const findSupp = async (q) => {
    const { data } = await admin.from('supplements').select('id, product_name').ilike('product_name', `%${q}%`).limit(1)
    if (!data?.length) console.log(`  ⚠ 못 찾음(건기식): ${q}`)
    return data?.[0] ?? null
  }
  const iso = (ms) => new Date(ms).toISOString().split('T')[0]
  const now = Date.now()
  const rxPicks = [await findDrug('아모잘탄'), await findDrug('크레스토')].filter(Boolean)
  const otc = await findDrug('타이레놀')
  const supp = await findSupp('오메가')

  const { data: rx, error: pErr } = await admin.from('user_prescriptions').insert({
    user_id: uid, member_id: selfId, hospital_name: '예시내과의원', department: '내과',
    pharmacy_name: '예시약국', prescribed_at: iso(now - 3 * 86_400_000), duration_days: 30,
  }).select('id').single()
  if (pErr) throw new Error('prescription: ' + pErr.message)

  const rows = [
    ...rxPicks.map((d, i) => ({
      user_id: uid, member_id: selfId, prescription_id: rx.id, drug_id: d.id,
      schedule_type: 'daily', dose_amount: 1, doses_per_day: i === 0 ? 1 : 2, total_days: 30,
      source: 'ocr', meal_times: i === 0 ? ['morning'] : ['morning', 'evening'],
    })),
    ...(otc ? [{ user_id: uid, member_id: selfId, drug_id: otc.id, schedule_type: 'prn',
      doses_per_day: 1, source: 'manual', meal_times: [] }] : []),
    ...(supp ? [{ user_id: uid, member_id: selfId, supplement_id: supp.id, schedule_type: 'daily',
      dose_amount: 1, doses_per_day: 1, total_days: 90, source: 'manual', meal_times: ['morning'] }] : []),
  ]
  const { error: mErr } = await admin.from('user_medications').insert(rows)
  if (mErr) throw new Error('meds: ' + mErr.message)
  console.log(`  약 ${rows.length}건 시드`)
} else {
  console.log(`  약 ${count}건 이미 있음 — 시드 건너뜀`)
}

// ── 4) 산출 ───────────────────────────────────────────────
const out = new URL('../_workspace/play/', import.meta.url)
mkdirSync(out, { recursive: true })
writeFileSync(new URL('reviewer-account.txt', out), [
  `# Play Console → App content → App access 에 옮겨 적는다 (이 파일은 gitignore)`,
  `발급: ${new Date().toISOString()}`,
  `uid: ${uid}`,
  `Username: ${EMAIL}`,
  `Password: ${password}`,
  '',
].join('\n'))
console.log(`\nREVIEWER_OK → _workspace/play/reviewer-account.txt`)
