// 약국 코드 직접 입력 → 실제 단골(regular_pharmacy_id) 연결 시뮬레이션.
// 실제 약국(개화약국) 코드를 DB에서 읽어, 임시 환자 유저가 코드로 연결되는지 검증.
// link-store 라우트 로직 재현: (1) 코드 정규화 (2) admin으로 약국 조회
//   (3) user 토큰으로 본인 profiles를 updateRegularPharmacy(표시 필드 denormalize)로 연결.
// 운영 DB 사용 후 임시 유저 전량 삭제(개화약국 행은 읽기만·불변).
// 실행: node --experimental-strip-types e2e/dangol-code-link-qa.mjs
import { createClient } from '@supabase/supabase-js'
import { loadEnv } from './_env.mjs'
import { normalizeStoreCode } from '../src/lib/store-code.ts'
import { updateRegularPharmacy } from '../src/lib/regular-pharmacy.ts'

const { URL_, ANON, SERVICE } = loadEnv()
const admin = createClient(URL_, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } })

const results = []
const check = (name, cond, extra = '') => { results.push({ name, pass: !!cond }); console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`) }

const now = Date.now()
const pw = 'E2e!' + Math.random().toString(36).slice(2) + 'Aa9'
const email = `e2e-dangol+${now}@yaksaro-e2e.test`
let uid = null

try {
  // 0) 실제 약국 코드 조회(store_id 있는 약국 = B2B 대상)
  const { data: pharm, error: pErr } = await admin
    .from('pharmacies').select('id, name, store_id, phone, address').not('store_id', 'is', null).limit(1).single()
  if (pErr || !pharm) throw new Error('테스트할 store_id 보유 약국 없음: ' + (pErr?.message ?? ''))
  const code = pharm.store_id
  console.log(`\n[대상] ${pharm.name} · 코드=${code} · id=${pharm.id}`)

  // 1) 정규화가 실제 코드를 보존하는가(대문자·공백·URL 붙여넣기 관대 해석하되 코드 자체는 그대로)
  check('정규화: 원본 코드 보존', normalizeStoreCode(code) === code, `${JSON.stringify(normalizeStoreCode(code))} vs ${JSON.stringify(code)}`)
  check('정규화: 대문자 입력 허용', normalizeStoreCode(code.toUpperCase()) === code)
  check('정규화: 앞뒤 공백 허용', normalizeStoreCode(`  ${code}  `) === code)
  check('정규화: 전체 URL 붙여넣기 허용', normalizeStoreCode(`https://care.yaksaro.co.kr/store/${code}`) === code)

  // 2) 임시 환자 유저 생성(트리거가 profiles 자동 생성)
  const { data: created, error: cErr } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true })
  if (cErr) throw new Error('createUser: ' + cErr.message)
  uid = created.user.id

  // 3) link-store 재현: 정규화 코드로 admin 약국 조회 → user 토큰으로 본인 profile 연결(표시 필드 포함)
  const normalized = normalizeStoreCode(`  ${code.toUpperCase()}  `)  // 지저분한 입력을 일부러 사용
  const { data: found } = await admin.from('pharmacies').select('id, name, phone, address').eq('store_id', normalized).maybeSingle()
  check('코드로 약국 조회됨', !!found && found.id === pharm.id, `normalized=${normalized}`)

  const userClient = createClient(URL_, ANON, { auth: { autoRefreshToken: false, persistSession: false } })
  const { error: sErr } = await userClient.auth.signInWithPassword({ email, password: pw })
  if (sErr) throw new Error('signIn: ' + sErr.message)

  const { error: uErr } = await updateRegularPharmacy(userClient, uid, found)
  check('user 토큰으로 본인 profiles 연결 성공(RLS 통과)', !uErr, uErr?.message)

  // 4) 연결 결과 확인(user 토큰 조회) — 조인이 아닌 denormalize된 표시 필드로 이름을 읽는다
  const { data: prof } = await userClient
    .from('profiles')
    .select('regular_pharmacy_id, regular_pharmacy_name, regular_pharmacy_phone')
    .eq('id', uid).single()
  check('regular_pharmacy_id가 대상 약국으로 설정됨', prof?.regular_pharmacy_id === pharm.id, `got=${prof?.regular_pharmacy_id}`)
  check('약국명이 profiles에 denormalize되어 환자에게 표시 가능', prof?.regular_pharmacy_name === pharm.name, `name=${prof?.regular_pharmacy_name}`)
  check('hasB2BPharmacy(=id 존재) 참 → 요청 채널 활성', !!prof?.regular_pharmacy_id)

  // 5) 오타 코드는 연결 안 됨(음성 대조)
  const bad = normalizeStoreCode(code + 'x')
  const { data: none } = await admin.from('pharmacies').select('id').eq('store_id', bad).maybeSingle()
  check('오타 코드는 약국 조회 0건', !none, `bad=${bad}`)
} catch (e) {
  check('예외 없이 완주: ' + (e?.message ?? e), false)
} finally {
  if (uid) { await admin.from('members').delete().eq('owner_id', uid); await admin.auth.admin.deleteUser(uid) }
  console.log('\n[정리] 임시 환자 유저 삭제 완료 (개화약국 행은 불변)')
}

const passed = results.filter(r => r.pass).length
const failed = results.length - passed
console.log(`\n===== 단골 코드 연결 시뮬레이션: ${passed}/${results.length} PASS, ${failed} FAIL =====`)
if (failed > 0) { console.log('실패:', results.filter(r => !r.pass).map(r => r.name).join(' | ')); process.exit(1) }
