// DUR 단일 약 플래그(066) 계약 검증 — 노인주의·효능군중복.
// 서버가 localhost:3000 에 떠 있어야 한다(run.mjs 와 동일 전제).
//
//  [A] 노인주의 등재약 + 같은 효능군 2종 등록 → 처방 그룹을 "펼치면" 두 배지가 보인다
//  [B] 같은 군 한쪽 삭제 → 중복 배지 소멸(1개뿐이면 중복 아님) · 노인주의는 유지
//  [C] bulk 등록이 발화한 dur_shadow_logs.severity_summary 에 신규 키 합류
//      (기존 severity 키 이름공간과 충돌 없음)
//
// ⚠️ 배지는 접힌 그룹 헤더가 아니라 펼친 MedCardItem 안에 있다(면책·출처와 같은 화면).
//    따라서 SSR HTML 문자열 검사로는 영원히 안 보인다 — Playwright 로 실제 클릭해 확인한다
//    (72일짜리 will-change 결함의 교훈: 값이 있어도 화면에 없을 수 있다. 그 역도 검사 방식이 만든다).
//
// 픽스처(운영 drugs·dur_single_flags 실측 2026-08-26):
//   노인주의: 페니라민정 196000011 / 중복쌍: 다오닐정 197000068 + 다이그린정 197700114 (당뇨병용제)
// 등재 목록이 바뀌면 픽스처를 교체할 것.
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { loadEnv } from './_env.mjs'

const BASE = 'http://localhost:3000'
const ELDERLY = { name: '페니라민정', item_seq: '196000011' }
const DUP_A   = { name: '다오닐정',   item_seq: '197000068' }
const DUP_B   = { name: '다이그린정', item_seq: '197700114' }
const DUP_GROUP = '당뇨병용제'

const { URL_, ANON, SERVICE } = loadEnv()
const admin = createClient(URL_, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } })

let pass = 0, fail = 0
const ok = (cond, label) => {
  if (cond) { pass++; console.log(`  ✅ ${label}`) }
  else { fail++; console.log(`  ❌ ${label}`) }
}
const sleep = ms => new Promise(r => setTimeout(r, ms))

// ── 임시 유저 + 세션쿠키
const email = `e2e-durflags+${Date.now()}@yaksaro-e2e.test`
const password = 'E2e!' + Math.random().toString(36).slice(2) + 'Aa9'
const { data: created, error: cErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
if (cErr) throw new Error('createUser: ' + cErr.message)
const uid = created.user.id

let captured = []
const ssr = createServerClient(URL_, ANON, { cookies: { getAll: () => [], setAll: (arr) => { captured = arr } } })
const { error: sErr } = await ssr.auth.signInWithPassword({ email, password })
if (sErr) { await admin.auth.admin.deleteUser(uid); throw new Error('signIn: ' + sErr.message) }
const cookie = captured.map(c => `${c.name}=${c.value}`).join('; ')

const nowSec = Math.floor(Date.now() / 1000)
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
await ctx.addCookies(captured.map(c => ({
  name: c.name, value: c.value, domain: 'localhost', path: c.options?.path || '/',
  expires: nowSec + 3600, httpOnly: false, secure: false, sameSite: 'Lax',
})))

// /wallet 을 열고 처방 그룹을 펼친 뒤, 배지 텍스트의 가시성을 돌려준다
async function expandedBadges(page) {
  await page.goto(`${BASE}/wallet`, { waitUntil: 'networkidle' })
  const header = page.getByRole('button').filter({ hasText: 'DUR플래그내과' }).first()
  await header.waitFor({ state: 'visible', timeout: 10000 })
  await header.click()
  await page.getByText('페니라민정', { exact: false }).nth(1).waitFor({ state: 'visible', timeout: 5000 }).catch(() => {})
  // 중복 배지는 같은 군의 카드 수만큼(≥2) 매칭된다 — first() 없이 isVisible 을 부르면
  // strict mode 위반이 throw 되고 catch 가 false 로 삼킨다(이 QA 의 첫 실패 원인).
  return {
    elderly: await page.getByText('노인주의 등재').first().isVisible().catch(() => false),
    dup:     await page.getByText(`같은 효능군(${DUP_GROUP})`, { exact: false }).first().isVisible().catch(() => false),
  }
}

try {
  // 본인 멤버 (setup.mjs 패턴 — 트리거 선생성분 재사용)
  const { data: existing } = await admin.from('members').select('id, is_self').eq('owner_id', uid)
  let selfId = (existing ?? []).find(m => m.is_self)?.id
  if (!selfId) {
    const { data: s, error } = await admin.from('members').insert({ owner_id: uid, name: '본인', relation: '본인', is_self: true }).select('id').single()
    if (error) throw new Error('member self: ' + error.message)
    selfId = s.id
  }

  // 처방전 — 배지는 처방 그룹 카드(MedCardItem)에서 렌더되므로 처방 소속으로 등록한다
  const { data: rx, error: rErr } = await admin.from('user_prescriptions')
    .insert({ user_id: uid, member_id: selfId, hospital_name: 'DUR플래그내과', prescribed_at: new Date().toISOString().split('T')[0], duration_days: 30 })
    .select('id').single()
  if (rErr) throw new Error('rx: ' + rErr.message)

  // bulk 등록(사용자 토큰) — item_seq 해석 + logDurShadow 발화까지 실제 경로 그대로
  const bulkRes = await fetch(`${BASE}/api/medications/bulk`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({
      prescription_id: rx.id,
      medicines: [
        { ...ELDERLY, meal_times: ['morning'], doses_per_day: 1, days: 30 },
        { ...DUP_A,   meal_times: ['morning'], doses_per_day: 1, days: 30 },
        { ...DUP_B,   meal_times: ['morning'], doses_per_day: 1, days: 30 },
      ],
    }),
  })
  ok(bulkRes.ok, `bulk 등록 HTTP ${bulkRes.status}`)

  console.log('[A] 펼친 카드에 두 배지')
  const page = await ctx.newPage()
  const a = await expandedBadges(page)
  ok(a.elderly, '노인주의 배지 표시')
  ok(a.dup, `효능군중복 배지 표시(${DUP_GROUP})`)

  console.log('[B] 한쪽 삭제 → 중복 소멸·노인주의 유지')
  const { data: dupBMed } = await admin.from('user_medications')
    .select('id, drug:drugs(item_seq)').eq('user_id', uid).is('deleted_at', null)
  const target = (dupBMed ?? []).find(m => m.drug?.item_seq === DUP_B.item_seq)
  ok(!!target, '삭제 대상(다이그린정) 존재')
  if (target) await admin.from('user_medications').update({ deleted_at: new Date().toISOString() }).eq('id', target.id)
  const b = await expandedBadges(page)
  ok(!b.dup, '중복 배지 소멸')
  ok(b.elderly, '노인주의 배지 유지')

  console.log('[C] 섀도 로그 신규 키')
  let summary = null
  for (let i = 0; i < 10 && !summary; i++) {  // fire-and-forget — 최대 5초 대기
    const { data } = await admin.from('dur_shadow_logs')
      .select('severity_summary').eq('user_id', uid)
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (data) summary = data.severity_summary
    else await sleep(500)
  }
  ok(!!summary, 'dur_shadow_logs 행 생성(bulk 발화)')
  ok((summary?.elderly_caution ?? 0) >= 1, `elderly_caution 카운트 (got ${summary?.elderly_caution})`)
  ok((summary?.efficacy_duplicate ?? 0) >= 1, `efficacy_duplicate 카운트 (got ${summary?.efficacy_duplicate})`)
} finally {
  await browser.close().catch(() => {})
  // 050 CASCADE 가 user_medications·user_prescriptions·members 까지 정리한다
  await admin.auth.admin.deleteUser(uid).catch(() => {})
}

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${pass}/${pass + fail}`)
process.exit(fail === 0 ? 0 : 1)
