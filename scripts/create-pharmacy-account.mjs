/**
 * 약국(약사) 계정 수동 발급 스크립트 — 관리자 전용.
 *
 * 셀프 회원가입은 제공하지 않는다. 운영자가 이 스크립트로 약사 계정을 만들고
 * 이메일+비밀번호를 약국에 전달한다. (약국은 /pharmacy/login 에서 접속)
 *
 * 동작:
 *   1) Supabase Auth 유저 생성(email_confirm: true, metadata.role='pharmacist')
 *      → on_auth_user_created 트리거가 profiles 행을 role='pharmacist'로 자동 생성
 *   2) pharmacies 행 생성(owner_id = 신규 유저, store_id 자동 발급, subscription_status='trial')
 *
 * 실행:
 *   node scripts/create-pharmacy-account.mjs \
 *     --email=pharmacy@example.com --name='행복약국' \
 *     [--phone=02-123-4567] [--address='서울시 …'] [--license=서울1234]
 *
 * 비밀번호는 **인자로 받지 않는다**. 셸 히스토리와 프로세스 목록(ps/작업관리자)에 평문으로
 * 남아, 그 기기를 볼 수 있는 사람이 약사 계정을 그대로 가져갈 수 있기 때문이다.
 * 약사 계정 1개는 그 약국에 동의한 단골 환자 전원의 복약 이력 열쇠다.
 * 대신 CSPRNG 로 강한 비밀번호를 생성해 이 콘솔에 1회만 출력한다.
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { randomBytes, randomInt } from 'crypto'
import { createClient } from '@supabase/supabase-js'

// ── .env.local 로드 ─────────────────────────────────────────────────────
const env = {}
readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8').split('\n').forEach(l => {
  const [k, ...v] = l.split('=')
  if (k && !k.startsWith('#')) env[k.trim()] = v.join('=').trim()
})

// ── CLI 인자 파싱 (--key=value) ─────────────────────────────────────────
const args = {}
for (const a of process.argv.slice(2)) {
  const m = a.match(/^--([^=]+)=(.*)$/)
  if (m) args[m[1]] = m[2]
}

const { email, name, phone, address, license } = args
if (!email || !name) {
  console.error('필수 인자 누락. 사용법:')
  console.error("  node scripts/create-pharmacy-account.mjs --email=… --name='약국명' [--phone=…] [--address='…'] [--license=…]")
  process.exit(1)
}
if (args.password !== undefined) {
  console.error('--password 인자는 지원하지 않습니다. 셸 히스토리·프로세스 목록에 평문으로 남습니다.')
  console.error('비밀번호는 스크립트가 자동 생성해 1회 출력합니다. 인자를 빼고 다시 실행하세요.')
  process.exit(1)
}

// 24자 base64url(≈143비트) — 사람이 외우는 값이 아니라 전달 후 즉시 변경 대상이다.
const password = randomBytes(18).toString('base64url')

const url = env['NEXT_PUBLIC_SUPABASE_URL']
const serviceKey = env['SUPABASE_SERVICE_ROLE_KEY']
if (!url || !serviceKey) {
  console.error('.env.local 에 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요')
  process.exit(1)
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// store_id 는 QR 포스터에 인쇄돼 오프라인에 오래 남는 식별자다.
// Math.random()은 예측 가능하므로 CSPRNG(randomInt)를 쓴다.
function genStoreId() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let s = 'yc-'
  for (let i = 0; i < 6; i++) s += chars[randomInt(chars.length)]
  return s
}

async function main() {
  // 1) Auth 유저 생성 (트리거가 profiles를 role='pharmacist'로 생성)
  const { data: created, error: userErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: name, role: 'pharmacist' },
  })
  if (userErr || !created?.user) {
    console.error('❌ Auth 유저 생성 실패:', userErr?.message ?? userErr)
    process.exit(1)
  }
  const userId = created.user.id
  console.log(`✓ Auth 유저 생성: ${email} (${userId})`)

  // 1-b) role 승격 — 049 이후 트리거는 가입 메타데이터의 role 을 신뢰하지 않고 항상 'patient'로
  //      만든다(사용자가 signUp 메타데이터로 자기 승격하는 것을 막기 위해).
  //      따라서 이 service_role UPDATE 가 약사 계정을 만드는 **유일한** 경로다.
  const { error: roleErr } = await admin
    .from('profiles').update({ role: 'pharmacist', full_name: name }).eq('id', userId)
  if (roleErr) {
    console.error('❌ role 승격 실패:', roleErr.message)
    console.error('   (Auth 유저는 생성됨 — 해당 유저를 삭제하고 재실행하세요)')
    process.exit(1)
  }

  // 2) store_id 충돌 회피 후 pharmacies 생성
  let storeId = genStoreId()
  for (let i = 0; i < 5; i++) {
    const { data: dup } = await admin.from('pharmacies').select('id').eq('store_id', storeId).maybeSingle()
    if (!dup) break
    storeId = genStoreId()
  }

  const { data: pharmacy, error: phErr } = await admin
    .from('pharmacies')
    .insert({
      owner_id: userId,
      name,
      phone: phone ?? null,
      address: address ?? null,
      license_number: license ?? null,
      store_id: storeId,
      subscription_status: 'trial',
    })
    .select('id, store_id')
    .single()

  if (phErr || !pharmacy) {
    console.error('❌ pharmacies 생성 실패:', phErr?.message ?? phErr)
    console.error('   (Auth 유저는 생성됨 — 재실행 전 해당 유저를 삭제하거나 수동 정리 필요)')
    process.exit(1)
  }

  console.log(`✓ 약국 생성: ${name} (id=${pharmacy.id}, store_id=${pharmacy.store_id})`)
  console.log('\n────────────────────────────────────────')
  console.log('  약국에 전달할 로그인 정보 (1회 출력 — 다시 볼 수 없음)')
  console.log('────────────────────────────────────────')
  console.log(`  접속:    /pharmacy/login`)
  console.log(`  이메일:  ${email}`)
  console.log(`  비밀번호: ${password}`)
  console.log(`  QR 코드:  /store/${pharmacy.store_id}`)
  console.log('────────────────────────────────────────')
  console.log('  ⚠ 이 비밀번호는 DB 에 해시로만 저장되며 재조회할 수 없습니다.')
  console.log('  ⚠ 평문이 남지 않는 경로(대면·전화·자동삭제 메시지)로 전달하고,')
  console.log('    전달 후 이 터미널 기록을 지우세요. 분실 시 재발급하면 됩니다.')
  console.log('────────────────────────────────────────\n')
}

main().catch(e => { console.error(e); process.exit(1) })
