// 성분 단위 상호작용 규칙표(068) — 스키마 계약·RLS·동결 실측.
//
// 왜 필요한가: 이 두 테이블은 조회 시점 조인의 토대라, 제약이나 RLS 가 한 번 어긋나면
// 증상이 "거짓 경고" 또는 "경고가 그냥 안 뜸" 으로 나타난다. 둘 다 화면에서는 조용하다.
//
// 증명 목표
//   [A] 제약 — 역순·자기쌍·중복·NULL 이 실제로 **거부된다**(선언 확인이 아니라 거부 재현)
//   [B] RLS  — ingredient_norms 는 로그인 사용자에게 열려 있고 / ingredient_interactions 는
//              **아무에게도 열려 있지 않다**(070) / 양쪽 다 못 쓴다
//   [C] 동결 — interactions 행 수·체크섬이 068 시점 기준선과 같다
//   [D] 매핑 — ingredient_norms 가 drug_ingredients 를 실제로 덮는다
//
// [B] 의 양방향이 핵심이다. "전부 0건" 만 보면 정책이 모두를 막는 경우와 구분되지 않고,
// 그러면 조회가 조용히 빈 결과를 내면서 화면은 정상처럼 보인다.
// → 그래서 ingredient_norms(열림, 1행)를 대조군으로 함께 잰다. 그 줄이 살아 있어야만
//   ingredient_interactions 의 0행이 "닫혀서 0" 이라는 증거가 된다.
//
// ⚠️ 2026-09-01: ingredient_interactions 쪽 단언이 **뒤집혔다.** 070 이
//    `drop policy "ingredient_interactions_read"` 로 이 표를 service_role 전용으로 좁혔다.
//    그 전 버전은 "로그인 사용자는 읽는다(=1행)" 를 단언했고, 070 적용 후 실패한다.
//
// 방법: service_role 로 탐침 행을 심고 익명·로그인 토큰으로 실측한 뒤 전량 회수한다.
//       탐침 키에 __e2e_ 접두를 달아 실데이터와 섞이지 않는다.
// 실행: node e2e/interaction-ingredient-qa.mjs
import { createClient } from '@supabase/supabase-js'
import { loadEnv } from './_env.mjs'

const { URL_, ANON, SERVICE } = loadEnv()
const admin = createClient(URL_, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } })

// 068 적용 시점(2026-08-28)에 기록한 동결 기준선.
// 이 값이 움직였다면 어떤 ETL 이 여전히 interactions 에 쓰고 있다는 뜻이다.
const FREEZE_ROWS = 305005
const FREEZE_MD5 = 'd041087f4f064706edda05f1f2743e0f'

const results = []
const check = (name, cond, extra = '') => {
  results.push({ name, pass: !!cond })
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`)
}

const P = '__e2e_ii_'          // 탐침 접두 — 실데이터와 절대 겹치지 않는다
const NA = `${P}a`, NB = `${P}b`
const NORM = `${P}name`

let userId = null

async function cleanup() {
  await admin.from('ingredient_interactions').delete().like('norm_key_a', `${P}%`)
  await admin.from('ingredient_interactions').delete().like('norm_key_b', `${P}%`)
  await admin.from('ingredient_norms').delete().like('name_en', `${P}%`)
  if (userId) await admin.auth.admin.deleteUser(userId)
}

async function main() {
  console.log('━━ 성분 단위 상호작용 규칙표(068) QA ━━\n')
  await cleanup()   // 앞 실행이 죽어서 남긴 탐침이 있으면 먼저 치운다

  // ── [A] 제약 — 거부를 재현한다 ────────────────────────────────
  console.log('[A] 제약 — 잘못된 행이 실제로 거부되는가')
  {
    const ok = await admin.from('ingredient_interactions')
      .insert({ norm_key_a: NA, norm_key_b: NB, description: 'probe', source: 'e2e' })
    check('정렬쌍(a<b)은 삽입된다', !ok.error, ok.error?.message)

    const rev = await admin.from('ingredient_interactions')
      .insert({ norm_key_a: NB, norm_key_b: NA, source: 'e2e' })
    check('역순(b<a)은 거부된다', rev.error?.code === '23514', rev.error?.code ?? '거부되지 않음')

    const self = await admin.from('ingredient_interactions')
      .insert({ norm_key_a: NA, norm_key_b: NA, source: 'e2e' })
    check('자기쌍(a=b)은 거부된다', self.error?.code === '23514', self.error?.code ?? '거부되지 않음')

    const dup = await admin.from('ingredient_interactions')
      .insert({ norm_key_a: NA, norm_key_b: NB, source: 'e2e' })
    check('중복쌍은 거부된다', dup.error?.code === '23505', dup.error?.code ?? '거부되지 않음')

    const nul = await admin.from('ingredient_interactions')
      .insert({ norm_key_a: null, norm_key_b: NB, source: 'e2e' })
    check('norm_key NULL 은 거부된다', nul.error?.code === '23502', nul.error?.code ?? '거부되지 않음')
  }

  // ── [B] RLS — 양방향 ──────────────────────────────────────────
  console.log('\n[B] RLS — norms 는 로그인에 열림(대조군) · interactions 는 070 으로 전면 차단 · 양쪽 쓰기 금지')
  {
    await admin.from('ingredient_norms')
      .insert({ name_en: NORM, norm_key: `${P}key`, source: 'e2e' })

    // 탐침 행이 실제로 있다는 것부터 확인한다 — 빈 테이블에 익명 0건은 아무 증거도 아니다
    const { count: realNorms } = await admin.from('ingredient_norms')
      .select('*', { count: 'exact', head: true }).like('name_en', `${P}%`)
    const { count: realInter } = await admin.from('ingredient_interactions')
      .select('*', { count: 'exact', head: true }).like('norm_key_a', `${P}%`)
    check('탐침 행이 존재한다(대조의 전제)', realNorms === 1 && realInter === 1, `norms=${realNorms} inter=${realInter}`)

    const anon = createClient(URL_, ANON, { auth: { autoRefreshToken: false, persistSession: false } })
    const an = await anon.from('ingredient_norms').select('name_en').like('name_en', `${P}%`)
    const ai = await anon.from('ingredient_interactions').select('norm_key_a').like('norm_key_a', `${P}%`)
    check('익명은 ingredient_norms 를 못 읽는다', (an.data?.length ?? 0) === 0, `rows=${an.data?.length}`)
    check('익명은 ingredient_interactions 를 못 읽는다', (ai.data?.length ?? 0) === 0, `rows=${ai.data?.length}`)

    const aw = await anon.from('ingredient_interactions')
      .insert({ norm_key_a: `${P}x`, norm_key_b: `${P}y` })
    check('익명은 쓸 수 없다', !!aw.error, aw.error?.code ?? '썼다')

    // 로그인 사용자 — norms 가 열려 있는지(대조군) + interactions 가 닫혀 있는지(070)
    const email = `ii_qa_${Date.now()}@example.com`
    const password = 'E2e!' + Math.random().toString(36).slice(2) + 'Aa9'
    const { data: created, error: cErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
    if (cErr) throw new Error('createUser: ' + cErr.message)
    userId = created.user.id

    const user = createClient(URL_, ANON, { auth: { autoRefreshToken: false, persistSession: false } })
    const { error: sErr } = await user.auth.signInWithPassword({ email, password })
    if (sErr) throw new Error('signIn: ' + sErr.message)

    const un = await user.from('ingredient_norms').select('name_en').like('name_en', `${P}%`)
    const ui = await user.from('ingredient_interactions').select('norm_key_a').like('norm_key_a', `${P}%`)
    // ingredient_norms 는 070 대상이 아니다 — 여기가 대조군이다.
    // 이 줄이 1행이어야만 아래의 0행이 "닫혀서 0" 이라는 증거가 된다(로그인이 죽어서 0 이 아니라).
    check('로그인 사용자는 ingredient_norms 를 읽는다', (un.data?.length ?? 0) === 1, `rows=${un.data?.length} err=${un.error?.message ?? '-'}`)
    // ⚠️ 2026-09-01 뒤집힘. 이 줄은 원래 "로그인 사용자는 읽는다(=1행)" 였다.
    //    070 이 `drop policy "ingredient_interactions_read"` 로 이 표를 service_role 전용으로
    //    좁혔다 — DUR 등재 원문 보관표라 소비 코드가 붙기 전에 닫아 둔다는 판단이다.
    //    따라서 지금은 **로그인 사용자도 0행**이 정답이다.
    //    ※ 이 브랜치의 소비 코드(interactions-ingredient.ts)는 반드시 service_role(admin)로
    //      호출할 것. 사용자 클라이언트로 부르면 에러 없이 조용히 0행이 온다(070 주석 참조).
    check('로그인 사용자도 ingredient_interactions 를 못 읽는다 (070)', (ui.data?.length ?? 0) === 0, `rows=${ui.data?.length} err=${ui.error?.message ?? '-'}`)

    const uw = await user.from('ingredient_interactions')
      .insert({ norm_key_a: `${P}p`, norm_key_b: `${P}q` })
    check('로그인 사용자도 쓸 수 없다(쓰기 정책 없음)', !!uw.error, uw.error?.code ?? '썼다')
  }

  // ── [C] 동결 ──────────────────────────────────────────────────
  console.log('\n[C] 동결 — interactions 가 068 시점에서 움직이지 않았는가')
  {
    const { count } = await admin.from('interactions').select('*', { count: 'exact', head: true })
    check(`interactions 행 수가 기준선과 같다 (${FREEZE_ROWS.toLocaleString()})`, count === FREEZE_ROWS,
      `현재 ${count?.toLocaleString()} — 다르면 어떤 ETL 이 여전히 쓰고 있다(md5 기준선 ${FREEZE_MD5})`)
  }

  // ── [D] 매핑 커버리지 ─────────────────────────────────────────
  console.log('\n[D] 매핑 — ingredient_norms 가 drug_ingredients 를 덮는가')
  {
    const { count: normCount } = await admin.from('ingredient_norms')
      .select('*', { count: 'exact', head: true }).not('name_en', 'like', `${P}%`)
    check('ingredient_norms 가 비어 있지 않다', (normCount ?? 0) > 1000, `${normCount?.toLocaleString()}행`)

    // 성분 위치를 표본으로 뽑아 매핑에 걸리는지 본다(전량 조인은 이 하네스의 몫이 아니다)
    const { data: sample } = await admin.from('drug_ingredients').select('name_en').limit(500)
    const names = [...new Set((sample ?? []).map(r => r.name_en).filter(Boolean))]
    const { data: hit } = await admin.from('ingredient_norms').select('name_en').in('name_en', names)
    const rate = names.length ? (hit?.length ?? 0) / names.length : 0
    check('표본 성분명의 95% 이상이 매핑된다', rate >= 0.95, `${(rate * 100).toFixed(1)}% (${hit?.length}/${names.length})`)
  }

  await cleanup()

  const failed = results.filter(r => !r.pass)
  console.log(`\n${failed.length === 0 ? 'PASS' : 'FAIL'} — ${results.length - failed.length}/${results.length}`)
  if (failed.length) { failed.forEach(f => console.log(`  ✗ ${f.name}`)); process.exit(1) }
}

main().catch(async (e) => {
  console.error('\n오류:', e.message)
  await cleanup().catch(() => {})
  process.exit(1)
})
