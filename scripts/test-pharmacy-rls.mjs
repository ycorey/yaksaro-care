/**
 * 약사 모드 RLS 누수 테스트 — 약사 "사용자 토큰"으로 실제 SELECT가
 * 동의 게이트대로 동작하는지 검증한다. (service_role로 테스트하면 RLS 우회 → 무의미)
 *
 * 선행: ① supabase에서 014_pharmacist_view_consent.sql 실행
 *       ② 약사 계정(profiles.role='pharmacist' + pharmacies.owner_id 연결) 존재
 *       ③ 테스트 환자: 동의 O / 미동의 / 타약국 / 철회 케이스
 *
 * 실행: PHARMACIST_TOKEN=<약사 access_token> \
 *       P_CONSENT=<동의환자id> P_NOCONSENT=<미동의id> P_OTHER=<타약국id> \
 *       node scripts/test-pharmacy-rls.mjs
 *   (access_token: 약사로 로그인 후 브라우저 콘솔
 *    `JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k=>k.includes('auth-token')))).access_token`)
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'

const env = {}
readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8').split('\n').forEach(l => {
  const [k, ...v] = l.split('='); if (k && !k.startsWith('#')) env[k.trim()] = v.join('=').trim()
})

const token = process.env.PHARMACIST_TOKEN
if (!token) { console.error('PHARMACIST_TOKEN 환경변수 필요 (약사 access_token)'); process.exit(1) }

// 약사 사용자 토큰으로 클라이언트 (anon key + Authorization)
const sb = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['NEXT_PUBLIC_SUPABASE_ANON_KEY'], {
  global: { headers: { Authorization: `Bearer ${token}` } },
  auth: { persistSession: false },
})

const cases = [
  ['동의 단골 환자',   process.env.P_CONSENT,   true],   // 보여야 함
  ['미동의 단골 환자', process.env.P_NOCONSENT, false],  // 0건
  ['타 약국 환자',     process.env.P_OTHER,     false],  // 0건
]

let blocker = false
for (const [label, pid, expectVisible] of cases) {
  if (!pid) { console.log('SKIP', label, '(id 미지정)'); continue }
  for (const table of ['user_medications', 'user_prescriptions', 'profiles']) {
    const col = table === 'profiles' ? 'id' : 'user_id'
    const { data, error } = await sb.from(table).select('*', { count: 'exact', head: false }).eq(col, pid)
    const n = data?.length ?? 0
    const ok = expectVisible ? n > 0 : n === 0
    if (!ok && !expectVisible) blocker = true
    console.log(
      ok ? '  PASS' : (expectVisible ? '  WARN' : '  ⛔ LEAK'),
      `${label} · ${table}: ${n}건`,
      error ? `(err: ${error.message})` : '',
    )
  }
}

console.log(blocker
  ? '\n⛔ 누수 발견 — 미동의/타약국 환자 데이터가 약사에게 노출됨. RLS 동의 게이트 점검 필요.'
  : '\n✅ 음성 테스트 통과 — 미동의/타약국 환자는 0건.')
process.exit(blocker ? 1 : 0)
