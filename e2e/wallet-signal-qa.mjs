// 지갑 안전 신호·착지 피드백 계약 검증 (2026-08-27 자문 3렌즈 반영분).
// 서버가 localhost:3000 에 떠 있어야 한다(run.mjs 와 동일 전제).
//
//  [A] DUR 배지는 버튼 — 탭하면 정보 토글이 열리고 "노인주의 등재 내용" 원문이 보인다
//      (배지가 막다른 span 이던 시절로의 회귀 방지 — "상세는 토글 안" 약속의 내용물)
//  [B] 접힌 그룹 헤더 점이 효능군중복에도 점등 (상호작용만 보던 시절로의 회귀 방지)
//  [C] OTC 칩 — 같은 효능군이면 warning 스타일 + 섹션 배너 문구
//      (durDupGroup 을 계산해 놓고 칩 UI 가 버리던 결함의 회귀 방지)
//  [D] /wallet?added=otc — 토스트 + 일반의약품 섹션 스크롤 + URL 정리
//      ⚠️ 전체 문서 로드로 검증한다 — 자식 effect 가 루트 Toaster 구독보다 먼저 도는
//      가장 어려운 경로다(동기 발사 시절엔 여기서만 토스트가 유실됐다).
//  [E] 정보 패널 분류 정체성 — DB-first(drugs.etc_otc_name/form_code_name)
//
// 픽스처(운영 실측 2026-08-26): 노인주의 페니라민정 196000011 /
// 중복쌍 다오닐정 197000068(처방) + 다이그린정 197700114(OTC — 처방↔OTC 교차 중복)
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { loadEnv } from './_env.mjs'

const BASE = 'http://localhost:3000'
const { URL_, ANON, SERVICE } = loadEnv()
const admin = createClient(URL_, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } })

let pass = 0, fail = 0
const ok = (cond, label) => { if (cond) { pass++; console.log(`  ✅ ${label}`) } else { fail++; console.log(`  ❌ ${label}`) } }

const email = `e2e-walletsig+${Date.now()}@yaksaro-e2e.test`
const password = 'E2e!' + Math.random().toString(36).slice(2) + 'Aa9'
const { data: created, error: cErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
if (cErr) throw new Error('createUser: ' + cErr.message)
const uid = created.user.id

let captured = []
const ssr = createServerClient(URL_, ANON, { cookies: { getAll: () => [], setAll: (arr) => { captured = arr } } })
const { error: sErr } = await ssr.auth.signInWithPassword({ email, password })
if (sErr) { await admin.auth.admin.deleteUser(uid); throw new Error('signIn: ' + sErr.message) }
const cookie = captured.map(c => `${c.name}=${c.value}`).join('; ')

const browser = await chromium.launch()
try {
  const { data: existing } = await admin.from('members').select('id, is_self').eq('owner_id', uid)
  let selfId = (existing ?? []).find(m => m.is_self)?.id
  if (!selfId) {
    const { data: s, error } = await admin.from('members').insert({ owner_id: uid, name: '본인', relation: '본인', is_self: true }).select('id').single()
    if (error) throw new Error('member self: ' + error.message)
    selfId = s.id
  }

  const iso = new Date().toISOString().split('T')[0]
  const { data: rx, error: rErr } = await admin.from('user_prescriptions')
    .insert({ user_id: uid, member_id: selfId, hospital_name: '성모내과의원', prescribed_at: iso, duration_days: 14 })
    .select('id').single()
  if (rErr) throw new Error('rx: ' + rErr.message)
  const bulkRes = await fetch(`${BASE}/api/medications/bulk`, {
    method: 'POST', headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({
      prescription_id: rx.id,
      medicines: [
        // 에나폰정(삼환계 항우울제) — 노인주의 '실원문'(폴백 아님) 보유 정상품목.
        // 원문이 "…나타나기 쉬움으로 소량으로 신중투여"로 끝나므로 정제 결과가 화면에 실제로 렌더된다
        // (페니라민정은 '성분: X' 폴백이라 정제 시 null → 이 단언을 세울 수 없다).
        { name: '에나폰정10밀리그램', item_seq: '197000079', meal_times: ['morning'], doses_per_day: 1, days: 14 },
        { name: '다오닐정',   item_seq: '197000068', meal_times: ['morning'], doses_per_day: 1, days: 14 },
        { name: '어린이타이레놀산160밀리그램', item_seq: '202005623', meal_times: ['morning'], doses_per_day: 1, days: 14 },
      ],
    }),
  })
  ok(bulkRes.ok, `bulk 등록 HTTP ${bulkRes.status}`)
  const { data: dgRow } = await admin.from('drugs').select('id').eq('item_seq', '197700114').maybeSingle()
  ok(!!dgRow, '다이그린정 마스터 조회')
  const { error: otcErr } = await admin.from('user_medications').insert({
    user_id: uid, member_id: selfId, drug_id: dgRow.id, schedule_type: 'daily', meal_times: [], source: 'manual',
  })
  ok(!otcErr, 'OTC 다이그린정 등록(무처방)')

  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const nowSec = Math.floor(Date.now() / 1000)
  await ctx.addCookies(captured.map(c => ({
    name: c.name, value: c.value, domain: 'localhost', path: c.options?.path || '/',
    expires: nowSec + 3600, httpOnly: false, secure: false, sameSite: 'Lax',
  })))
  const page = await ctx.newPage()

  console.log('[B] 접힌 헤더 점 — 효능군중복 점등')
  await page.goto(`${BASE}/wallet`, { waitUntil: 'networkidle' })
  // 라벨에 "안전"을 쓰지 않는다(판정 금지) — 이 단언이 문구 회귀도 함께 지킨다
  ok(await page.locator('[aria-label="함께 볼 정보 있음"]').first().isVisible().catch(() => false), '접힌 상태에서 점 표시')
  ok(await page.locator('[aria-label*="안전"]').count() === 0, 'aria-label 에 "안전" 없음')

  console.log('[C] OTC 칩 — 중복 warning + 배너')
  ok(await page.getByText('같은 효능군 약이 함께 등록돼 있어요', { exact: false }).first().isVisible().catch(() => false), 'OTC 배너 문구')
  ok(await page.locator('div.bg-yc-warningBg', { hasText: '다이그린정' }).first().isVisible().catch(() => false), 'OTC 칩 warning 스타일')

  console.log('[A] 배지 탭 → 토글 열림 + 등재 내용')
  const h1 = page.getByRole('button').filter({ hasText: '성모내과의원' }).first()
  await h1.scrollIntoViewIfNeeded(); await h1.click()
  const elderlyBadge = page.getByRole('button', { name: '노인주의 등재' }).first()
  ok(await elderlyBadge.waitFor({ state: 'visible', timeout: 8000 }).then(() => true, () => false), '노인주의 배지(버튼) 표시')
  const badgeBox = await elderlyBadge.boundingBox()
  ok(!!badgeBox && badgeBox.height >= 44, `배지 터치 타겟 44px+ (got ${Math.round(badgeBox?.height ?? 0)}px)`)
  await elderlyBadge.click()
  ok(await page.getByText('노인주의 등재 내용', { exact: false }).first().waitFor({ state: 'visible', timeout: 10000 }).then(() => true, () => false), '패널에 등재 내용(정제본)')
  ok(await page.getByText('기립성 저혈압', { exact: false }).first().isVisible().catch(() => false), '사실(부작용 경향)은 보존')
  // 지시문 유출 회귀 — 원문 "…소량으로 신중투여"가 그대로 실리면 용량 조절 지시가 된다
  ok(!(await page.getByText('신중투여', { exact: false }).first().isVisible().catch(() => false)), '처방자용 투여 지시문 미노출')
  ok(!(await page.getByText('소량으로', { exact: false }).first().isVisible().catch(() => false)), '용량 조절 표현 미노출')

  console.log('[A2] 효능군중복 배지 탭 → 같은 패널에 중복 안내')
  const dupBadge = page.getByRole('button', { name: /같은 효능군/ }).first()
  await dupBadge.scrollIntoViewIfNeeded(); await dupBadge.click()
  ok(await page.getByText('중복 복용 여부는 담당 약사와 상담하세요', { exact: false }).first().waitFor({ state: 'visible', timeout: 10000 }).then(() => true, () => false), '패널 최상단 효능군 중복 안내')

  console.log('[E] 정보 패널 분류 정체성(DB-first)')
  // ⚠️ .last() 로 고르면 안 된다 — bulk insert 3행의 created_at 이 동률이라 정렬이 비결정적이고,
  //    다른 약의 토글을 눌러도 '분류 배지' 단언이 전체 페이지에서 매칭돼 조용히 통과한다.
  //    카드(li) 스코프로 고정해 "타이레놀 카드의 분류" 임을 보장한다.
  const tyCard = page.locator('li', { hasText: '어린이타이레놀' }).first()
  const tyToggle = tyCard.getByText('어떤 약인가요', { exact: false }).first()
  await tyToggle.scrollIntoViewIfNeeded(); await tyToggle.click()
  ok(await tyCard.getByText('해열.진통.소염제', { exact: false }).first().waitFor({ state: 'visible', timeout: 10000 }).then(() => true, () => false), '분류 배지(해열.진통.소염제)')
  ok(await tyCard.locator('span.text-xs', { hasText: '일반의약품' }).first().isVisible().catch(() => false), '전문/일반 배지(일반의약품)')

  console.log('[J] 약 정보 패널 — 긴 필드는 접혀 있고, 펼치면 원문이 나온다')
  // 기본 상태: 접힌 라벨은 보이고 본문은 안 보인다
  const cautionToggle = tyCard.locator('summary', { hasText: '복용 전 확인할 것' }).first()
  ok(await cautionToggle.isVisible().catch(() => false), '주의사항 접힘 라벨 표시')
  const cautionBody = tyCard.locator('[data-quoted="mfds"]').first()
  ok(!(await cautionBody.isVisible().catch(() => false)), '기본 상태에서 주의사항 본문 미노출')

  // 터치 타겟
  const sBox = await cautionToggle.boundingBox()
  ok(!!sBox && sBox.height >= 44, `접힘 라벨 터치 타겟 44px+ (got ${Math.round(sBox?.height ?? 0)}px)`)

  // 펼치면 본문이 나온다
  await cautionToggle.click()
  ok(await cautionBody.waitFor({ state: 'visible', timeout: 5000 }).then(() => true, () => false), '펼치면 주의사항 본문 표시')

  // 앱이 쓴 문구에는 음성 판정 어구가 없다 — 원문 인용 블록은 제외한다
  // (원문에는 용량 수치와 "복용하지 마십시오" 가 정당하게 들어 있고, 출처 푸터의
  //  "식품의약품안전처" 도 "안전" 부분문자열을 포함하므로 판정 어구로 좁혀서 본다)
  const appText = await tyCard.evaluate(el => {
    const clone = el.cloneNode(true)
    clone.querySelectorAll('[data-quoted="mfds"]').forEach(n => n.remove())
    return clone.textContent || ''
  })
  ok(!/안전합니다|안전해요|검출되지 않|이상 없습니다|문제 없습니다/.test(appText), '앱 문구에 음성 판정 어구 없음')

  console.log('[D] /wallet?added=otc — 토스트 + 섹션 스크롤 (전체 로드)')
  // networkidle 대기는 sonner 토스트 수명(4s)을 소진한다 — commit 직후부터 지켜본다
  await page.goto(`${BASE}/wallet?added=otc`, { waitUntil: 'commit' })
  ok(await page.getByText('일반의약품 목록에 담았어요').first().waitFor({ state: 'visible', timeout: 10000 }).then(() => true, () => false), '착지 토스트')
  await page.waitForTimeout(1200)
  const otcSec = await page.locator('#sec-otc').boundingBox()
  ok(!!otcSec && otcSec.y < 500, `일반의약품 섹션으로 스크롤 (y=${Math.round(otcSec?.y ?? -1)})`)
  ok(page.url().endsWith('/wallet'), `URL 파라미터 정리 (${page.url().replace(BASE, '')})`)

  console.log('[G] 나머지 착지 분기 — rx(스크롤 없음)·supp(sec-supp 앵커)')
  await page.goto(`${BASE}/wallet?added=rx`, { waitUntil: 'commit' })
  ok(await page.getByText('처방의약품 목록에 담았어요').first().waitFor({ state: 'visible', timeout: 10000 }).then(() => true, () => false), 'rx 토스트')
  await page.goto(`${BASE}/wallet?added=supp`, { waitUntil: 'commit' })
  ok(await page.getByText('영양보조제 목록에 담았어요').first().waitFor({ state: 'visible', timeout: 10000 }).then(() => true, () => false), 'supp 토스트')
  await page.waitForTimeout(1200)
  const suppSec = await page.locator('#sec-supp').boundingBox()
  // 앵커 id 오타(sec-sup 등)를 잡는 자리 — 토스트만 보면 스크롤 실패를 못 본다
  ok(!!suppSec && suppSec.y < 500, `영양보조제 섹션으로 스크롤 (y=${Math.round(suppSec?.y ?? -1)})`)

  console.log('[H] 직접입력 약 — 이름 부분일치 결과를 사진·분류로 채택하지 않는다')
  // item_seq 가 없으면 이름으로 조회되어 형제 품목이 잡힐 수 있다. 실버 UX 에서 사진은
  // 약을 식별하는 앵커라 오귀속 비용이 가장 크므로 카드에 붙으면 안 된다.
  const { error: cErr2 } = await admin.from('user_medications').insert({
    user_id: uid, member_id: selfId, prescription_id: rx.id,
    custom_name: '타이레놀', schedule_type: 'daily', meal_times: ['morning'], source: 'manual',
  })
  ok(!cErr2, '직접입력 약 등록')
  await page.goto(`${BASE}/wallet`, { waitUntil: 'networkidle' })
  const h3 = page.getByRole('button').filter({ hasText: '성모내과의원' }).first()
  await h3.click()
  const customCard = page.locator('li', { hasText: '타이레놀' }).filter({ hasNot: page.locator('text=어린이타이레놀') }).first()
  const customToggle = customCard.getByText('어떤 약인가요', { exact: false }).first()
  await customToggle.scrollIntoViewIfNeeded(); await customToggle.click()
  // 패널은 두 모습 중 하나다: 설명이 있으면(다른 품목에서 온 것) **반드시 출처를 밝혀야** 하고,
  // 설명이 없으면 "쉬운 설명 자료가 없어요"만 뜬다. 설명은 보이는데 출처가 없으면 그것이 오귀속이다.
  await customCard.getByText(/어떤 약인가요|닫기/).first().waitFor({ state: 'visible', timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(3000)
  const custHasEfcy = await customCard.getByText('효능·효과', { exact: false }).first().isVisible().catch(() => false)
  const custHasSrc  = await customCard.getByText('아래 정보는', { exact: false }).first().isVisible().catch(() => false)
  ok(!custHasEfcy || custHasSrc, `설명 표시 시 출처 명시 (설명=${custHasEfcy}, 출처=${custHasSrc})`)
  ok(await customCard.locator('img').count() === 0, `카드에 사진 미채택 (img ${await customCard.locator('img').count()}개)`)
  ok(!(await customCard.getByText('해열.진통.소염제', { exact: false }).first().isVisible().catch(() => false)), '분류 배지 미채택')

  console.log('[F] rx-loose — 분류 용어로 선언하지 않는다')
  // 처방탭에서 병원·일수를 비우면 약은 일반의약품 섹션에 담기지만 전문의약품일 수 있다
  await page.goto(`${BASE}/wallet?added=rx-loose`, { waitUntil: 'commit' })
  ok(await page.getByText('복약 목록에 담았어요').first().waitFor({ state: 'visible', timeout: 10000 }).then(() => true, () => false), '분류 중립 토스트')
  ok(!(await page.getByText('일반의약품 목록에 담았어요').first().isVisible().catch(() => false)), '"일반의약품" 선언 없음')

  console.log('[I] 저장 완주 — 폼 제출 → 서버액션 → 착지 (URL 직접 이동이 아닌 실사용 경로)')
  // 저장소 전체에 '복약 목록에 추가' 를 실제로 누르는 e2e 가 0개였다 — actions.ts 의
  // redirect 대상·insert 실패 throw 를 오늘 바꿔 놓고 아무도 그 경로를 지나지 않았다.
  await page.goto(`${BASE}/medications/add?tab=otc`, { waitUntil: 'networkidle' })
  await page.getByPlaceholder(/타이레놀/).first().fill('우루사')
  const hit = page.getByRole('button').filter({ hasText: '우루사' }).first()
  ok(await hit.waitFor({ state: 'visible', timeout: 10000 }).then(() => true, () => false), '검색 후보 표시')
  await hit.click()
  const submit = page.getByRole('button', { name: '복약 목록에 추가' })
  ok(await submit.isEnabled().catch(() => false), '저장 버튼 활성')
  await submit.click()
  await page.waitForURL(/\/wallet/, { timeout: 20000 }).catch(() => {})
  ok(page.url().includes('/wallet'), `지갑 착지 (${page.url().replace(BASE, '')})`)
  ok(await page.getByText('일반의약품 목록에 담았어요').first().waitFor({ state: 'visible', timeout: 10000 }).then(() => true, () => false), '저장 완주 토스트')
  ok(await page.getByText('우루사', { exact: false }).first().isVisible().catch(() => false), '등록한 약이 목록에 보인다')
} finally {
  await browser.close().catch(() => {})
  await admin.auth.admin.deleteUser(uid).catch(() => {})   // 050 CASCADE 로 처방·복약 전량 정리
}

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${pass}/${pass + fail}`)
process.exit(fail === 0 ? 0 : 1)
