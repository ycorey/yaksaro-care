// Play 심사자 계정 — 운영 DB에 **상시 유지되는** 이메일+비밀번호 환자 계정을 만든다.
//
// 왜 필요한가: 환자 로그인이 구글·카카오뿐이면 심사자가 앱에 들어올 수단이 없어 리젝된다.
// 입구(`/login` → [이메일로 로그인])는 2026-08-31 에 만들었지만 **자력 가입이 없어** 계정은
// 관리자가 발급해야 한다. store-assets/seed.mjs 와 달리 teardown 하지 않는다 — 심사는 출시 후
// 업데이트마다 다시 오므로 계정이 살아 있어야 한다.
//
// 동의는 미리 찍지 않는다(consentedPatientMeta 미사용). 로그인 폼이 [필수] 체크 2개를 매번
// 요구하고 서버가 미체크를 거절하므로(login/actions.ts) 심사자는 §23 동의를 직접 지나간다.
// (검증 로그인을 한 번이라도 하면 consent_health 는 true 로 남는다 — 심사자 경험은 같다.)
// 약은 미리 넣어 둔다 — 빈 지갑은 심사자에게 기능이 안 읽힌다.
//
// 처방 row 의 duration_days 는 **일부러 null** 로 둔다. 041 `end_expired_medications`(매일 08:00 cron)
// 가 `prescribed_at + duration_days < today` 인 처방약을 자동 종료하는데, 심사는 발급 후 몇 주 뒤에
// 올 수 있다. 남은 일수 표기는 약 row 의 total_days 가 담당하므로 지갑 카드는 그대로 나온다.
//
// 멱등: 있으면 계정·본인 member·약을 보장하고, 처방일을 오늘 기준으로 되돌린다(ended_at 도 해제).
//   → **제출·업데이트 심사 직전에 한 번 더 돌리면** 지갑이 "D+3 · 30일 처방" 상태로 초기화된다.
// 비밀번호는 기본으로 건드리지 않는다 — Play Console 에 적힌 값이 조용히 무효가 되면 안 된다.
//   회전이 필요하면 `--rotate` 로 실행하고 Console → App content → App access 를 반드시 갱신할 것.
// 산출물: _workspace/play/reviewer-account.txt (gitignore — 비밀번호 포함, --rotate 또는 신규 생성 시에만 기록)
// 실행: node scripts/play-reviewer-account.mjs [--rotate]
import { writeFileSync, mkdirSync } from 'node:fs'
import { randomInt } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { loadEnv } from '../e2e/_env.mjs'

const EMAIL = 'play-reviewer@yaksaro.co.kr'
const ROTATE = process.argv.includes('--rotate')
const { URL_, SERVICE } = loadEnv()
const admin = createClient(URL_, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } })

// 영문 대소문자+숫자 — 심사자가 손으로 옮겨 적으므로 헷갈리는 글자(0/O, 1/l/I)는 뺀다.
// 고정 접두·접미가 대문자·기호·숫자·소문자 4종을 보장하고, 무작위 12자는 randomInt 로 편향 없이 뽑는다.
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
const newPassword = () => 'Review!' + Array.from({ length: 12 }, () => ALPHA[randomInt(ALPHA.length)]).join('') + '7a'

const iso = (ms) => new Date(ms).toISOString().split('T')[0]
const now = Date.now()
const prescribedAt = iso(now - 3 * 86_400_000)

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
let password = null
const existing = await findUser(EMAIL)
if (existing) {
  uid = existing.id
  if (ROTATE) {
    password = newPassword()
    const { error } = await admin.auth.admin.updateUserById(uid, { password, email_confirm: true })
    if (error) throw new Error('updateUser: ' + error.message)
    console.log(`기존 계정 비밀번호 회전: ${uid}`)
    console.log('⚠ Play Console → App content → App access 의 비밀번호를 반드시 갱신할 것')
  } else {
    console.log(`기존 계정 유지(비밀번호 그대로): ${uid}  — 회전은 --rotate`)
  }
} else {
  password = newPassword()
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

// ── 3) 약 — 없으면 시드, 있으면 처방일·종료 상태를 오늘 기준으로 되돌린다 ──
const { count } = await admin.from('user_medications')
  .select('id', { count: 'exact', head: true }).eq('user_id', uid).is('deleted_at', null)
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
  const rxPicks = [await findDrug('아모잘탄'), await findDrug('크레스토')].filter(Boolean)
  const otc = await findDrug('타이레놀')
  const supp = await findSupp('오메가')
  // 처방약이 하나도 안 잡히면 빈 처방 row 만 남는다 — 마스터가 없는 DB 에서는 여기서 멈춘다
  if (rxPicks.length === 0) throw new Error('drugs 마스터에서 처방약을 찾지 못했다 — 운영 DB 가 맞는지 확인')

  const { data: rx, error: pErr } = await admin.from('user_prescriptions').insert({
    user_id: uid, member_id: selfId, hospital_name: '예시내과의원', department: '내과',
    pharmacy_name: '예시약국', prescribed_at: prescribedAt, duration_days: null,
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
  // 처방일을 3일 전으로, 종료된 약은 되살린다 — 지갑이 "D+3 · 30일 처방" 으로 보이게
  const { error: rErr } = await admin.from('user_prescriptions')
    .update({ prescribed_at: prescribedAt, duration_days: null }).eq('user_id', uid)
  if (rErr) throw new Error('prescription refresh: ' + rErr.message)
  const { error: eErr } = await admin.from('user_medications')
    .update({ ended_at: null, created_at: new Date(now - 3 * 86_400_000).toISOString() })
    .eq('user_id', uid).is('deleted_at', null)
  if (eErr) throw new Error('meds refresh: ' + eErr.message)
  console.log(`  약 ${count}건 유지 — 처방일 ${prescribedAt} 로 갱신, 종료 상태 해제`)
}

// ── 4) 산출 — 비밀번호를 새로 만든 경우에만 파일을 쓴다(기존 파일을 빈 값으로 덮지 않는다) ──
if (password) {
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
} else {
  console.log(`\nREVIEWER_OK (비밀번호 변경 없음 — 기존 _workspace/play/reviewer-account.txt 그대로)`)
}
