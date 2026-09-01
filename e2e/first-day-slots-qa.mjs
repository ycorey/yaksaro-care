// 등록 당일 복용 시작 QA — "1일 3회 처방을 저녁에 등록하면 오늘은 저녁부터".
//
// 규칙(lib/meal-slots.slotsApplicableToday): 등록한 그날은 등록 시각에 이미 지나간
// 끼니를 오늘 일정에서 제외한다. 마감은 슬롯+3h(다음 슬롯 절삭), 자기 전은 자정.
// 이 테스트는 그 규칙이 /today 서버 렌더까지 실제로 배선됐는지를 실브라우저로 본다.
// 단위 테스트는 규칙 자체를, 여기는 배선을 검증한다 — 기대값 표는 일부러 소스에서
// import 하지 않고 스펙에서 따로 옮겨 적었다(소스와 같은 식으로 계산하면 동어반복이다).
//
// 결정론: 약의 created_at 을 "오늘 19:30 KST" 같은 절대시각으로 심는다. 규칙은
// (등록일==화면의 오늘: UTC 날짜)과 등록 시각의 KST 분(minute)만 보므로, 하루 중
// 언제 돌려도 결과가 같다. 유일한 예외는 시드~렌더 사이에 UTC 자정(=KST 09:00)이
// 끼는 경우라, 자정 3분 전이면 넘어갈 때까지 기다린다(아래 가드).
//
// 실행: (1) 서버 기동 (2) node e2e/first-day-slots-qa.mjs   — 자체 시드·정리
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { loadEnv } from './_env.mjs'
import { consentedPatientMeta } from './_seed-meta.mjs'

const BASE = process.env.QR_SIM_BASE || process.env.BASE || 'http://localhost:3000'
const { URL_, ANON, SERVICE } = loadEnv()
const admin = createClient(URL_, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } })

const results = []
const check = (name, cond, extra = '') => {
  results.push({ name, pass: !!cond })
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`)
}

// 화면-하루 경계(UTC 자정) 직전이면 넘어갈 때까지 대기 — 시드한 "오늘" 과 서버 렌더의
// "오늘" 이 어긋나는 유일한 창을 닫는다. CI 스케줄(01:00/13:00 UTC)에서는 항상 0ms.
const msToUtcMidnight = 86_400_000 - (Date.now() % 86_400_000)
if (msToUtcMidnight < 180_000) {
  console.log(`  (UTC 자정까지 ${Math.round(msToUtcMidnight / 1000)}s — 경계를 넘긴 뒤 시작)`)
  await new Promise(r => setTimeout(r, msToUtcMidnight + 5_000))
}

// 화면 규약과 같은 UTC 날짜 문자열 (오늘/어제). created_at 은 "그 날짜의 KST 시각" 으로
// 심는다 — 19:30 KST 는 10:30Z 라 UTC 날짜가 그대로 유지된다(09:00 KST 이후 시각만 사용).
const utcDate = (offsetDays = 0) =>
  new Date(Date.now() - offsetDays * 86_400_000).toISOString().split('T')[0]

// ── 시드 ──────────────────────────────────────────────────────────────
const now = Date.now()
const email = `e2e-test+${now}@yaksaro-e2e.test`
const password = 'E2e!' + Math.random().toString(36).slice(2) + 'Aa9'

const { data: created, error: cErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true , user_metadata: consentedPatientMeta() })
if (cErr) throw new Error('createUser: ' + cErr.message)
const uid = created.user.id

let selfId
try {
  const { data: existing } = await admin.from('members').select('id, is_self').eq('owner_id', uid)
  selfId = (existing ?? []).find(m => m.is_self)?.id
  if (!selfId) {
    const { data: s, error } = await admin.from('members')
      .insert({ owner_id: uid, name: '본인', relation: '본인', is_self: true }).select('id').single()
    if (error) throw new Error('member: ' + error.message)
    selfId = s.id
  }

  // 1일 3회(아침·점심·저녁) 약 — created_at 은 각 케이스에서 갈아끼운다
  const { data: med, error: mErr } = await admin.from('user_medications')
    .insert({
      user_id: uid, member_id: selfId, custom_name: '당일등록검증약',
      schedule_type: 'daily', doses_per_day: 3,
      meal_times: ['morning', 'afternoon', 'evening'],
      total_days: 5, source: 'manual',
    }).select('id').single()
  if (mErr) throw new Error('med: ' + mErr.message)
  const medId = med.id

  // 세션쿠키 캡처 (@supabase/ssr 가 setAll 로 정확한 쿠키를 생성 — setup.mjs 와 동일 규약)
  let captured = []
  const ssr = createServerClient(URL_, ANON, { cookies: { getAll: () => [], setAll: (arr) => { captured = arr } } })
  const { error: sErr } = await ssr.auth.signInWithPassword({ email, password })
  if (sErr) throw new Error('signIn: ' + sErr.message)
  const nowSec = Math.floor(now / 1000)
  const host = new URL(BASE).hostname
  const cookies = captured.map(c => ({
    name: c.name, value: c.value, domain: host, path: c.options?.path || '/',
    expires: c.options?.maxAge ? nowSec + c.options.maxAge : nowSec + 3600,
    httpOnly: false, secure: false, sameSite: 'Lax',
  }))

  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  await ctx.addCookies(cookies)
  const page = await ctx.newPage()

  // /today 의 슬롯 시간 라벨(타임라인 행의 tabular-nums)을 수집
  const visibleSlotTimes = async () => {
    await page.goto(`${BASE}/today`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2500)
    return page.evaluate(() =>
      [...document.querySelectorAll('p.tabular-nums')]
        .map(el => (el.textContent || '').trim())
        .filter(t => /^\d{2}:\d{2}$/.test(t)))
  }
  const setCreatedAt = async (iso) => {
    const { error } = await admin.from('user_medications').update({ created_at: iso }).eq('id', medId)
    if (error) throw new Error('created_at 갱신: ' + error.message)
  }
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b)

  // 기대값 표 — 스펙에서 직접 옮겨 적음(소스 미참조):
  //   morning 08:00 은 11:00 까지 / afternoon 12:30 은 15:30 까지 / evening 19:00 은 22:00 까지

  console.log('\n■ 등록 당일 복용 시작 (1일 3회 = 아침·점심·저녁 약)')

  // [A] 오늘 19:30 등록 → 저녁만 (사용자 시나리오 그대로)
  await setCreatedAt(`${utcDate()}T19:30:00+09:00`)
  const a = await visibleSlotTimes()
  check('[A] 오늘 19:30 등록 → 오늘은 저녁(19:00)만', eq(a, ['19:00']), JSON.stringify(a))

  // [B] 오늘 11:30 등록 → 아침만 제외 (경계: 아침 마감 11:00)
  await setCreatedAt(`${utcDate()}T11:30:00+09:00`)
  const b = await visibleSlotTimes()
  check('[B] 오늘 11:30 등록 → 점심(12:30)·저녁(19:00)부터', eq(b, ['12:30', '19:00']), JSON.stringify(b))

  // [C-음성대조] 같은 약을 "어제 19:30" 등록으로 바꾸면 전 끼니가 돌아온다 —
  // 필터가 created_at 을 보고 있다는 증명. 이게 없으면 [A][B]는 "원래 그랬다"와 구분이 안 된다.
  await setCreatedAt(`${utcDate(1)}T19:30:00+09:00`)
  const c = await visibleSlotTimes()
  check('[C] 어제 등록이면 전 끼니(08:00·12:30·19:00) 유지', eq(c, ['08:00', '12:30', '19:00']), JSON.stringify(c))

  await browser.close()
} finally {
  // ── 정리 — 유저 삭제(CASCADE 로 member·med 까지) ──
  const { error: dErr } = await admin.auth.admin.deleteUser(uid)
  console.log(dErr ? `  ⚠️ teardown 실패: ${dErr.message} (clean-orphans 가 수거)` : '  [정리] 임시 유저 삭제 완료')
}

const failed = results.filter(r => !r.pass)
console.log(`\n===== 등록 당일 복용 시작 QA: ${results.length - failed.length}/${results.length} PASS, ${failed.length} FAIL =====`)
if (failed.length) process.exit(1)
