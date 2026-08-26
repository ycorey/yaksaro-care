// 낱알식별 검색(067 + /api/drugs/identify + 낱알로 찾기 UI) 계약 검증.
// 서버가 localhost:3000 에 떠 있어야 한다(run.mjs 와 동일 전제).
//
// ETL(실데이터) 이전에도 돌 수 있도록 합성 픽스처를 심는다 — 각인에 'YKSR' 마커를 써서
// 실데이터가 적재된 뒤에도 이 QA 의 단언이 실데이터와 절대 섞이지 않는다.
//
//  [A] 모양+색+각인 검색 → 정확 매칭 1건 / 마커 공통어두 → 2건
//  [B] 각인 정규화 — 소문자·공백 입력이 같은 행에 닿는다
//  [C] 조건 없음 → 400 (전체 덤프 방지)
//  [D] 마스터에 없는 item_seq → 결과에서 제외 (등록 계약 불가 품목 미노출)
//  [E] 21건 이상 → 20건 + more=true (조건 추가 유도)
//  [F] UI: 낱알로 찾기 → 검색 → 후보 선택 → AddForm 에 해당 약이 프리필된다 (Playwright)
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { loadEnv } from './_env.mjs'

const BASE = 'http://localhost:3000'
const { URL_, ANON, SERVICE } = loadEnv()
const admin = createClient(URL_, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } })

// 실마스터 정상 품목 3종 (운영 drugs 실측 2026-08-26 — 사라지면 아래 셀렉트로 재선정)
const FIX_A = { item_seq: '195500005', name: '중외5%포도당생리식염액' }
const FIX_B = { item_seq: '195500006', name: '중외5%포도당주사액' }
const FIX_C = { item_seq: '195600004', name: '중외20%포도당주사액' }
const GHOST_SEQ = '000000001'  // 마스터에 없는 item_seq

let pass = 0, fail = 0
const ok = (cond, label) => {
  if (cond) { pass++; console.log(`  ✅ ${label}`) }
  else { fail++; console.log(`  ❌ ${label}`) }
}

// ── 임시 유저 + 세션쿠키
const email = `e2e-pillid+${Date.now()}@yaksaro-e2e.test`
const password = 'E2e!' + Math.random().toString(36).slice(2) + 'Aa9'
const { data: created, error: cErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
if (cErr) throw new Error('createUser: ' + cErr.message)
const uid = created.user.id

let captured = []
const ssr = createServerClient(URL_, ANON, { cookies: { getAll: () => [], setAll: (arr) => { captured = arr } } })
const { error: sErr } = await ssr.auth.signInWithPassword({ email, password })
if (sErr) { await admin.auth.admin.deleteUser(uid); throw new Error('signIn: ' + sErr.message) }
const cookie = captured.map(c => `${c.name}=${c.value}`).join('; ')

const api = async (qs) => {
  const res = await fetch(`${BASE}/api/drugs/identify?${qs}`, { headers: { cookie } })
  return { status: res.status, json: await res.json().catch(() => null) }
}

const manySeqs = []
const browser = await chromium.launch()
try {
  // ── 픽스처 시드 (마커 각인 — 실데이터와 격리)
  const rows = [
    { item_seq: FIX_A.item_seq, drug_shape: '원형',   color_class1: '하양', print_front: 'YKSRAA', print_back: null },
    { item_seq: FIX_B.item_seq, drug_shape: '원형',   color_class1: '하양', print_front: null, print_back: 'YKSRBB' },
    { item_seq: FIX_C.item_seq, drug_shape: '타원형', color_class1: '노랑', print_front: 'YKSRCC', print_back: null },
    { item_seq: GHOST_SEQ,      drug_shape: '원형',   color_class1: '하양', print_front: 'YKSRDD', print_back: null },
  ]
  // [E]용: 같은 조건 25건 — 마스터 결합이 필요하므로 실존 정상 품목 25종을 빌린다
  const { data: many } = await admin.from('drugs').select('item_seq').eq('is_canceled', false)
    .not('item_seq', 'is', null).order('item_seq', { ascending: false }).limit(25)
  for (const d of many ?? []) {
    manySeqs.push(d.item_seq)
    rows.push({ item_seq: d.item_seq, drug_shape: '팔각형', color_class1: '청록', print_front: 'YKSRMANY', print_back: null })
  }
  const { error: seedErr } = await admin.from('drug_identification').upsert(rows, { onConflict: 'item_seq' })
  if (seedErr) throw new Error('seed: ' + seedErr.message)

  console.log('[A] 모양+색+각인 정확/부분 매칭')
  const a1 = await api('shape=원형&color1=하양&print=YKSRAA')
  ok(a1.status === 200 && a1.json?.items?.length === 1, `정확 각인 1건 (got ${a1.json?.items?.length})`)
  ok(a1.json?.items?.[0]?.itemSeq === FIX_A.item_seq, '해당 품목 일치')
  ok(!!a1.json?.items?.[0]?.drugId, '등록 계약용 drugId 동봉')
  const a2 = await api('shape=원형&color1=하양&print=YKSR')
  const seqs2 = (a2.json?.items ?? []).map(i => i.itemSeq).sort()
  ok(seqs2.length === 2 && seqs2.includes(FIX_A.item_seq) && seqs2.includes(FIX_B.item_seq),
     `마커 어두 2건 — 앞/뒤 각인 모두 매칭 (got ${seqs2.join(',')})`)

  console.log('[B] 각인 정규화(소문자·공백)')
  const b = await api(`shape=원형&color1=하양&print=${encodeURIComponent('yksr aa')}`)
  ok(b.json?.items?.length === 1 && b.json.items[0].itemSeq === FIX_A.item_seq, '소문자+공백 입력이 같은 행에 닿음')

  console.log('[C] 조건 없음 → 400')
  const c = await api('')
  ok(c.status === 400, `HTTP 400 (got ${c.status})`)

  console.log('[D] 마스터 미존재 제외')
  const d = await api('shape=원형&color1=하양&print=YKSRDD')
  ok(d.status === 200 && d.json?.items?.length === 0, `유령 item_seq 미노출 (got ${d.json?.items?.length})`)

  console.log('[E] 20건 초과 → more')
  const e = await api('shape=팔각형&color1=청록')
  ok(e.json?.items?.length === 20, `20건 절단 (got ${e.json?.items?.length})`)
  ok(e.json?.more === true, 'more=true')

  console.log('[F] UI — 검색 → 선택 → AddForm 프리필')
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const nowSec = Math.floor(Date.now() / 1000)
  await ctx.addCookies(captured.map(cv => ({
    name: cv.name, value: cv.value, domain: 'localhost', path: cv.options?.path || '/',
    expires: nowSec + 3600, httpOnly: false, secure: false, sameSite: 'Lax',
  })))
  const page = await ctx.newPage()
  await page.goto(`${BASE}/medications/add?method=pill`, { waitUntil: 'networkidle' })
  ok(await page.getByText('낱알로 찾기').first().isVisible().catch(() => false), '낱알 화면 진입')
  await page.getByRole('button', { name: '원형', exact: true }).click()
  await page.getByRole('button', { name: '하양', exact: true }).click()
  await page.getByPlaceholder('예: TYLENOL, 마크, 숫자').fill('YKSRAA')
  await page.getByRole('button', { name: '약 찾기' }).click()
  // isVisible 은 즉시 검사(타임아웃 옵션 무시) — 렌더 대기는 waitFor 로 해야 한다
  const card = page.getByRole('button').filter({ hasText: FIX_A.name }).first()
  ok(await card.waitFor({ state: 'visible', timeout: 8000 }).then(() => true, () => false), '후보 카드 표시')
  ok(await page.getByText('식품의약품안전처').first().waitFor({ state: 'visible', timeout: 3000 }).then(() => true, () => false), '출처·상담 문구')
  await card.click()
  ok(await page.getByText('약 등록').first().isVisible({ timeout: 5000 }).catch(() => false), 'AddForm 화면 전환')
  ok(await page.getByText(FIX_A.name, { exact: false }).first().isVisible().catch(() => false), '선택 약 프리필')

  // 진입 카드(방법 선택 화면) 존재
  await page.goto(`${BASE}/medications/add?type=prescription`, { waitUntil: 'networkidle' })
  ok(await page.getByText('낱알로 찾기').first().isVisible().catch(() => false), '방법 선택 화면에 진입 카드')
} finally {
  await browser.close().catch(() => {})
  const seeded = [FIX_A.item_seq, FIX_B.item_seq, FIX_C.item_seq, GHOST_SEQ, ...manySeqs]
  await admin.from('drug_identification').delete().in('item_seq', seeded)
  await admin.auth.admin.deleteUser(uid).catch(() => {})
}

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${pass}/${pass + fail}`)
process.exit(fail === 0 ? 0 : 1)
