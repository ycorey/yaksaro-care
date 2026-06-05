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
 *     --email=pharmacy@example.com --password='초기비번' --name='행복약국' \
 *     [--phone=02-123-4567] [--address='서울시 …'] [--license=서울1234]
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'
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

const { email, password, name, phone, address, license } = args
if (!email || !password || !name) {
  console.error('필수 인자 누락. 사용법:')
  console.error("  node scripts/create-pharmacy-account.mjs --email=… --password=… --name='약국명' [--phone=…] [--address='…'] [--license=…]")
  process.exit(1)
}
if (password.length < 6) {
  console.error('비밀번호는 6자 이상이어야 합니다.')
  process.exit(1)
}

const url = env['NEXT_PUBLIC_SUPABASE_URL']
const serviceKey = env['SUPABASE_SERVICE_ROLE_KEY']
if (!url || !serviceKey) {
  console.error('.env.local 에 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요')
  process.exit(1)
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

function genStoreId() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let s = 'yc-'
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)]
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

  // 1-b) 트리거가 role을 못 채운 경우 대비(멱등 보정)
  await admin.from('profiles').update({ role: 'pharmacist', full_name: name }).eq('id', userId)

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
  console.log('  약국에 전달할 로그인 정보')
  console.log('────────────────────────────────────────')
  console.log(`  접속:    /pharmacy/login`)
  console.log(`  이메일:  ${email}`)
  console.log(`  비밀번호: ${password}`)
  console.log(`  QR 코드:  /store/${pharmacy.store_id}`)
  console.log('────────────────────────────────────────\n')
}

main().catch(e => { console.error(e); process.exit(1) })
