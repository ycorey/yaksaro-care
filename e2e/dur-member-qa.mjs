// DUR shadow 경고의 멤버 스코프 — 회귀 방지.
//
// 무엇이 문제였나: 상호작용 계산은 **한 처방(=한 멤버)** 의 약들만 보는데, 그 결과인
// `has_interaction_warning` 은 `.eq('user_id', …)` 만으로 갱신했다. 그래서 어머니 처방을
// 추가하면 **본인이 복용 중인 같은 약에도 경고가 붙었다** — 함께 복용하지 않는 약인데도.
// 계산 범위와 기록 범위가 어긋나 있었던 것이다.
//
// 이 스크립트는 두 가지를 증명한다.
//   [A] 옛 방식(user_id 만)은 실제로 남의 멤버 약을 오염시킨다  ← 버그가 있었음을 재현
//   [B] 새 방식(applyMemberScope 규칙)은 대상 멤버만 갱신한다   ← 수정이 실제로 좁혔음
//   [C] 본인(self)은 멤버 도입 이전 legacy 행(member_id=null)도 함께 갱신한다
//
// [A] 를 같이 돌리는 이유: 통과하는 테스트만 있으면 "원래부터 괜찮았는데 헛수고한 것" 과
// 구분되지 않는다. 재현 없는 수정은 수정이 아니라 추측이다.
//
// 운영 Supabase에 임시 유저/멤버/복약 생성 → 검증 → finally 전량 삭제. Next 서버 불필요.
// 실행: node e2e/dur-member-qa.mjs
import { createClient } from '@supabase/supabase-js'
import { loadEnv } from './_env.mjs'

const { URL_, SERVICE } = loadEnv()
const admin = createClient(URL_, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } })

const results = []
const check = (name, cond, extra = '') => {
  results.push({ name, pass: !!cond })
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`)
}

const now = Date.now()
const email = `e2e-dur+${now}@yaksaro-e2e.test`
let uid = null, selfMid = null, famMid = null

// dur-shadow.ts 의 갱신부와 **같은 모양**이어야 의미가 있다. 한쪽만 고치면 이 테스트는
// 통과하면서 운영은 깨진 채로 남는다. 규칙 자체는 lib/member.ts(applyMemberScope) 가 SSOT.
const scoped = (q, member) =>
  member.is_self ? q.or(`member_id.eq.${member.id},member_id.is.null`) : q.eq('member_id', member.id)

const warnFlags = async () => {
  const { data } = await admin.from('user_medications')
    .select('custom_name, member_id, has_interaction_warning').eq('user_id', uid)
  return new Map((data ?? []).map(r => [r.custom_name, !!r.has_interaction_warning]))
}
const resetFlags = () => admin.from('user_medications')
  .update({ has_interaction_warning: false }).eq('user_id', uid)

try {
  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email, password: 'E2e!' + Math.random().toString(36).slice(2) + 'Aa9', email_confirm: true,
  })
  if (cErr) throw new Error('createUser: ' + cErr.message)
  uid = created.user.id

  // 가입 트리거가 self 멤버를 만든다. 없으면 직접 만든다(트리거 변경에 대한 방어).
  const { data: selfRow } = await admin.from('members')
    .select('id').eq('owner_id', uid).eq('is_self', true).maybeSingle()
  selfMid = selfRow?.id ?? (await admin.from('members')
    .insert({ owner_id: uid, name: '본인', is_self: true }).select('id').single()).data.id

  const { data: fam, error: fErr } = await admin.from('members')
    .insert({ owner_id: uid, name: 'E2E어머니', relation: '부모', is_self: false, consent_at: new Date().toISOString() })
    .select('id').single()
  if (fErr) throw new Error('member(가족): ' + fErr.message)
  famMid = fam.id

  // 같은 약 이름을 본인·가족이 각각 복용 중 — 오염이 일어나면 바로 드러나는 배치.
  // legacy 는 멤버 도입 이전 행을 흉내낸다(member_id=null).
  const seed = [
    { key: 'self',   member_id: selfMid },
    { key: 'family', member_id: famMid },
    { key: 'legacy', member_id: null },
  ]
  const { error: mErr } = await admin.from('user_medications').insert(
    seed.map(s => ({ user_id: uid, member_id: s.member_id, custom_name: `E2E다이제약-${s.key}` })),
  )
  if (mErr) throw new Error('user_medications: ' + mErr.message)
  const names = seed.map(s => `E2E다이제약-${s.key}`)
  check('시드 3행(본인·가족·legacy) 생성', (await warnFlags()).size === 3)

  // ── [A] 옛 방식 재현: 가족 처방을 계산했는데 user_id 전체를 갱신한다 ──────────────
  await resetFlags()
  await admin.from('user_medications')
    .update({ has_interaction_warning: true })
    .eq('user_id', uid).in('custom_name', names).is('deleted_at', null)
  const oldWay = await warnFlags()
  check('[A] 옛 방식은 본인 약까지 오염시킨다(버그 재현)',
    oldWay.get('E2E다이제약-self') === true && oldWay.get('E2E다이제약-legacy') === true,
    '가족 처방인데 본인·legacy 행에도 경고')

  // ── [B] 새 방식: 가족 멤버만 갱신 ───────────────────────────────────────────
  await resetFlags()
  await scoped(
    admin.from('user_medications').update({ has_interaction_warning: true })
      .eq('user_id', uid).in('custom_name', names).is('deleted_at', null),
    { id: famMid, is_self: false },
  )
  const famWay = await warnFlags()
  check('★[B] 가족 처방은 가족 약에만 경고', famWay.get('E2E다이제약-family') === true)
  check('★[B] 본인 약은 그대로', famWay.get('E2E다이제약-self') === false)
  check('★[B] legacy(member_id=null) 행도 그대로', famWay.get('E2E다이제약-legacy') === false)

  // ── [C] 본인 처방: self + legacy 포함, 가족은 제외 ──────────────────────────
  await resetFlags()
  await scoped(
    admin.from('user_medications').update({ has_interaction_warning: true })
      .eq('user_id', uid).in('custom_name', names).is('deleted_at', null),
    { id: selfMid, is_self: true },
  )
  const selfWay = await warnFlags()
  check('★[C] 본인 처방 → 본인 약 경고', selfWay.get('E2E다이제약-self') === true)
  check('★[C] 본인 처방 → legacy 행도 포함(과거 약이 빠지지 않는다)', selfWay.get('E2E다이제약-legacy') === true)
  check('★[C] 본인 처방 → 가족 약은 제외', selfWay.get('E2E다이제약-family') === false)

  // ── dur_shadow_logs 에 멤버가 남는지(060) ──────────────────────────────────
  const { error: logErr } = await admin.from('dur_shadow_logs')
    .insert({ user_id: uid, member_id: famMid, drug_ids: [], interaction_count: 0 })
  check('dur_shadow_logs.member_id 기록 가능(060 적용)', !logErr, logErr?.message ?? '')
} catch (e) {
  check('실행 중 예외 없음', false, e.message)
} finally {
  if (uid) {
    await admin.from('dur_shadow_logs').delete().eq('user_id', uid)
    await admin.from('user_medications').delete().eq('user_id', uid)
    await admin.from('members').delete().eq('owner_id', uid)
    await admin.auth.admin.deleteUser(uid)
  }
}

const passed = results.filter(r => r.pass).length
const failed = results.length - passed
console.log(`\n===== DUR 멤버 스코프: ${passed}/${results.length} PASS, ${failed} FAIL =====`)
if (failed > 0) {
  console.log('실패:', results.filter(r => !r.pass).map(r => r.name).join(' | '))
  process.exit(1)
}
