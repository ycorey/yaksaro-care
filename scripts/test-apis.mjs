/**
 * 약사로 케어 — 공공 API 테스트 스크립트
 * 실행: node scripts/test-apis.mjs
 *
 * 사전 조건: .env.local에 실제 API 키 입력 완료
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'

// .env.local 파싱
const envPath = resolve(process.cwd(), '.env.local')
const env = {}
readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
  const [key, ...vals] = line.split('=')
  if (key && !key.startsWith('#')) env[key.trim()] = vals.join('=').trim()
})

const BASE = 'https://apis.data.go.kr'

// ────────────────────────────────────────────
// 헬퍼
// ────────────────────────────────────────────
async function call(label, url) {
  process.stdout.write(`\n[${label}] `)
  try {
    const res = await fetch(url)
    const text = await res.text()

    if (!res.ok) {
      console.log(`❌ HTTP ${res.status}`)
      console.log('   ', text.slice(0, 400))
      return
    }

    // 오류 코드 감지 (공공API는 200이어도 오류 반환)
    if (text.includes('SERVICE_KEY_IS_NOT_REGISTERED_ERROR')) {
      console.log('❌ 키 미등록 — data.go.kr에서 해당 API 신청 확인 필요')
      return
    }
    if (text.includes('INVALID_REQUEST_PARAMETER_ERROR')) {
      console.log('⚠️  파라미터 오류 (키는 유효)')
      return
    }
    if (text.includes('<totalCount>0</totalCount>') || text.includes('"totalCount":0')) {
      console.log('✅ 키 유효 (검색 결과 0건 — 정상)')
      return
    }

    // 첫 번째 항목 미리보기
    const preview = text.slice(0, 300).replace(/\s+/g, ' ')
    console.log('✅ 응답 정상')
    console.log('   ', preview)
  } catch (e) {
    console.log(`❌ 네트워크 오류: ${e.message}`)
  }
}

// ────────────────────────────────────────────
// 1. e약은요 (의약품개요정보)
// ────────────────────────────────────────────
async function testEasyDrug() {
  const key = env['MFDS_EASY_DRUG_KEY']
  if (!key || key.includes('여기에')) { console.log('\n[e약은요] ⏭  키 미입력'); return }
  const url = `${BASE}/1471000/DrbEasyDrugInfoService/getDrbEasyDrugList`
    + `?serviceKey=${encodeURIComponent(key)}&numOfRows=1&pageNo=1&itemName=아스피린&type=json`
  await call('e약은요', url)
}

// ────────────────────────────────────────────
// 2. 의약품 제품 허가정보
// ────────────────────────────────────────────
async function testDrugLicense() {
  const key = env['MFDS_DRUG_LICENSE_KEY']
  if (!key || key.includes('여기에')) { console.log('\n[의약품허가] ⏭  키 미입력'); return }
  const url = `${BASE}/1471000/DrugPrdtPrmsnInfoService07/getDrugPrdtPrmsnInq07`
    + `?serviceKey=${encodeURIComponent(key)}&numOfRows=1&pageNo=1&itemName=타이레놀&type=json`
  await call('의약품허가', url)
}

// ────────────────────────────────────────────
// 3. DUR 품목정보 (병용금기)
// ────────────────────────────────────────────
async function testDurItem() {
  const key = env['MFDS_DUR_ITEM_KEY']
  if (!key || key.includes('여기에')) { console.log('\n[DUR품목] ⏭  키 미입력'); return }
  const url = `${BASE}/1471000/DURPrdlstInfoService03/getUsjntTabooInfoList03`
    + `?serviceKey=${encodeURIComponent(key)}&numOfRows=1&pageNo=1&type=json`
  await call('DUR품목(병용금기)', url)
}

// ────────────────────────────────────────────
// 4. DUR 성분정보
// ────────────────────────────────────────────
async function testDurIngredient() {
  const key = env['MFDS_DUR_INGREDIENT_KEY']
  if (!key || key.includes('여기에')) { console.log('\n[DUR성분] ⏭  키 미입력'); return }
  const url = `${BASE}/1471000/DURIrdntInfoService03/getUsjntTabooInfoList02`
    + `?serviceKey=${encodeURIComponent(key)}&numOfRows=1&pageNo=1&type=json`
  await call('DUR성분', url)
}

// ────────────────────────────────────────────
// 5. 건강기능식품 정보
// ────────────────────────────────────────────
async function testHealthFood() {
  const key = env['MFDS_HEALTH_FOOD_KEY']
  if (!key || key.includes('여기에')) { console.log('\n[건강기능식품] ⏭  키 미입력'); return }
  const url = `${BASE}/1471000/HtfsInfoService03/getHtfsList01`
    + `?serviceKey=${encodeURIComponent(key)}&numOfRows=1&pageNo=1&prdlstNm=오메가&type=json`
  await call('건강기능식품', url)
}

// ────────────────────────────────────────────
// 6. 건강기능식품 개별인정형
// ────────────────────────────────────────────
async function testHealthFoodIndividual() {
  const key = env['MFDS_HEALTH_FOOD_INDIVIDUAL_KEY']
  if (!key || key.includes('여기에')) { console.log('\n[개별인정형] ⏭  키 미입력'); return }
  // 식품안전나라 포털 API — URL 형식이 data.go.kr과 다름
  const url = `https://openapi.foodsafetykorea.go.kr/api/${key}/I2790/json/1/1`
  await call('개별인정형', url)
}

// ────────────────────────────────────────────
// 실행
// ────────────────────────────────────────────
console.log('━━━ 약사로 케어 공공 API 테스트 ━━━')
await testEasyDrug()
await testDrugLicense()
await testDurItem()
await testDurIngredient()
await testHealthFood()
await testHealthFoodIndividual()
console.log('\n━━━ 완료 ━━━')
