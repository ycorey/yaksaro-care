// pharmacy_todos RLS 시나리오 — 약국 owner만 CRUD. 타 약사 조회/수정 0건.
// 운영 Supabase에 임시 약사 2명 + 약국 2개 생성 → 검증 → finally 전량 삭제.
// 실행: node e2e/pharmacy-todo-qa.mjs
import { createClient } from '@supabase/supabase-js'
import { loadEnv } from './_env.mjs'

const { URL_, ANON, SERVICE } = loadEnv()
const admin = createClient(URL_, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } })

const results = []
const check = (name, cond, extra = '') => { results.push({ name, pass: !!cond }); console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`) }

const now = Date.now()
const pw = 'E2e!' + Math.random().toString(36).slice(2) + 'Aa9'
const aEmail = `e2e-todo-a+${now}@yaksaro-e2e.test`
const bEmail = `e2e-todo-b+${now}@yaksaro-e2e.test`
let aUid = null, bUid = null, pharmA = null, pharmB = null, todoId = null

async function signed(email) {
  const c = createClient(URL_, ANON, { auth: { autoRefreshToken: false, persistSession: false } })
  const { error } = await c.auth.signInWithPassword({ email, password: pw })
  if (error) throw new Error('signIn ' + email + ': ' + error.message)
  return c
}

try {
  const mk = async (email) => {
    const { data, error } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true })
    if (error) throw new Error('createUser ' + email + ': ' + error.message)
    return data.user.id
  }
  aUid = await mk(aEmail); bUid = await mk(bEmail)
  const mkPharm = async (owner, sfx) => {
    const { data, error } = await admin.from('pharmacies').insert({ owner_id: owner, name: 'E2E약국' + sfx, store_id: `e2e-todo-${sfx}-${now}` }).select('id').single()
    if (error) throw new Error('pharmacy ' + sfx + ': ' + error.message)
    return data.id
  }
  pharmA = await mkPharm(aUid, 'A'); pharmB = await mkPharm(bUid, 'B')

  const aC = await signed(aEmail)
  const bC = await signed(bEmail)

  // T1: 약사A가 자기 약국 메모 생성
  const { data: ins, error: insErr } = await aC.from('pharmacy_todos').insert({ pharmacy_id: pharmA, text: '재고 확인' }).select('id').single()
  check('약사A: 자기 약국 메모 생성', !insErr && !!ins?.id, insErr?.message)
  todoId = ins?.id ?? null

  // T2: 약사A 조회 1건
  const { data: aList } = await aC.from('pharmacy_todos').select('id').eq('pharmacy_id', pharmA)
  check('약사A: 자기 메모 1건 조회', (aList ?? []).length === 1, `len=${(aList ?? []).length}`)

  // T3: 약사B가 A약국 메모 조회 0건(RLS 차단)
  const { data: bSee } = await bC.from('pharmacy_todos').select('id').eq('pharmacy_id', pharmA)
  check('약사B: 타약국 메모 0건', (bSee ?? []).length === 0, `len=${(bSee ?? []).length}`)

  // T4: 약사B가 A약국에 메모 삽입 시도 → with check 위반(0행/에러)
  const { data: bIns, error: bInsErr } = await bC.from('pharmacy_todos').insert({ pharmacy_id: pharmA, text: '침투' }).select('id')
  check('약사B: 타약국 삽입 차단', !!bInsErr || (bIns ?? []).length === 0, bInsErr?.message ?? 'no error but 0 rows')

  // T5: 약사B가 A의 메모 삭제 시도 → RLS로 0행 삭제(남아있어야 함)
  if (todoId) await bC.from('pharmacy_todos').delete().eq('id', todoId)
  const { data: still } = await aC.from('pharmacy_todos').select('id').eq('id', todoId)
  check('약사B: 타약국 메모 삭제 불가(잔존)', (still ?? []).length === 1, `len=${(still ?? []).length}`)
} catch (e) {
  check('예외 없이 완주: ' + (e?.message ?? e), false)
} finally {
  if (pharmA) await admin.from('pharmacy_todos').delete().eq('pharmacy_id', pharmA)
  if (pharmB) await admin.from('pharmacy_todos').delete().eq('pharmacy_id', pharmB)
  if (pharmA) await admin.from('pharmacies').delete().eq('id', pharmA)
  if (pharmB) await admin.from('pharmacies').delete().eq('id', pharmB)
  for (const uid of [aUid, bUid]) { if (uid) { await admin.from('members').delete().eq('owner_id', uid); await admin.auth.admin.deleteUser(uid) } }
  console.log('\n[정리] 임시 약사·약국·메모 삭제 완료')
}

const passed = results.filter(r => r.pass).length
const failed = results.length - passed
console.log(`\n===== pharmacy_todos RLS: ${passed}/${results.length} PASS, ${failed} FAIL =====`)
if (failed > 0) { console.log('실패:', results.filter(r => !r.pass).map(r => r.name).join(' | ')); process.exit(1) }
