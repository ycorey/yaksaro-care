import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  cleanGptNames, extractNames, resolveOneProduct, assembleResponse,
  mapLicenseToProduct, normalizeQuery, isValidOpenAiKey, emptyProduct,
  type LocalDrug, type LicenseDetail,
} from './ocr-product.ts'

const VALID_KEY = 'sk-' + 'a'.repeat(40)
// heuristic이 확실히 후보 1개('센트룸우먼')를 뽑는 텍스트: '건강기능식품'은 UNIT_RE로 걸러짐
const HEURISTIC_TEXT = '센트룸우먼\n건강기능식품'
const HEURISTIC_OUT = ['센트룸우먼']

// GPT 응답을 흉내내는 fetch 목 (ok + content) / 실패(!ok) / 예외(throw)
function gptOk(content: string): typeof fetch {
  return (async () => ({ ok: true, json: async () => ({ choices: [{ message: { content } }] }) })) as unknown as typeof fetch
}
const gptFail: typeof fetch = (async () => ({ ok: false, json: async () => ({}) })) as unknown as typeof fetch
const gptThrow: typeof fetch = (async () => { throw new Error('timeout') }) as unknown as typeof fetch

// ── isValidOpenAiKey ──────────────────────────────────────────────
test('isValidOpenAiKey: sk- 접두 + 길이', () => {
  assert.equal(isValidOpenAiKey(VALID_KEY), true)
  assert.equal(isValidOpenAiKey('sk-short'), false)
  assert.equal(isValidOpenAiKey('nope-' + 'a'.repeat(40)), false)
  assert.equal(isValidOpenAiKey(undefined), false)
})

// ── cleanGptNames (순수) ──────────────────────────────────────────
test('cleanGptNames: 문자열·길이 필터 + 트림', () => {
  assert.deepEqual(cleanGptNames({ names: ['a', 123, ' 타이레놀 ', '', 'x'.repeat(50)] }), ['타이레놀'])
})
test('cleanGptNames: names 없음/비배열 → []', () => {
  assert.deepEqual(cleanGptNames({}), [])
  assert.deepEqual(cleanGptNames(null), [])
  assert.deepEqual(cleanGptNames({ names: '타이레놀' }), [])
})
test('cleanGptNames: 최대 3개', () => {
  assert.deepEqual(cleanGptNames({ names: ['가가', '나나', '다다', '라라'] }), ['가가', '나나', '다다'])
})

// ── extractNames: 폴백 체인 전 구간 ───────────────────────────────
test('extractNames: 키 없음 → heuristic', async () => {
  assert.deepEqual(await extractNames(HEURISTIC_TEXT, { key: undefined, fetchImpl: gptThrow }), HEURISTIC_OUT)
})
test('extractNames: 잘못된 키 → heuristic (GPT 미호출)', async () => {
  assert.deepEqual(await extractNames(HEURISTIC_TEXT, { key: 'sk-short', fetchImpl: gptThrow }), HEURISTIC_OUT)
})
test('extractNames: GPT 정상 → 파싱된 이름 사용', async () => {
  const out = await extractNames('아무거나', { key: VALID_KEY, fetchImpl: gptOk('{"names":["타이레놀정500밀리그람","게보린"]}') })
  assert.deepEqual(out, ['타이레놀정500밀리그람', '게보린'])
})
test('extractNames: GPT HTTP 실패(500) → heuristic', async () => {
  assert.deepEqual(await extractNames(HEURISTIC_TEXT, { key: VALID_KEY, fetchImpl: gptFail }), HEURISTIC_OUT)
})
test('extractNames: GPT 응답 JSON 파싱 실패 → heuristic', async () => {
  assert.deepEqual(await extractNames(HEURISTIC_TEXT, { key: VALID_KEY, fetchImpl: gptOk('{깨진 JSON') }), HEURISTIC_OUT)
})
test('extractNames: GPT 정상이지만 names 빈 배열 → heuristic', async () => {
  assert.deepEqual(await extractNames(HEURISTIC_TEXT, { key: VALID_KEY, fetchImpl: gptOk('{"names":[]}') }), HEURISTIC_OUT)
})
test('extractNames: GPT 예외(타임아웃) → heuristic', async () => {
  assert.deepEqual(await extractNames(HEURISTIC_TEXT, { key: VALID_KEY, fetchImpl: gptThrow }), HEURISTIC_OUT)
})

// ── resolveOneProduct: 로컬 → 허가정보 → 미해결 ───────────────────
const localDrug: LocalDrug = {
  id: 'drug-1', item_seq: '200101', item_name: '타이레놀정500밀리그람',
  entp_name: '한국얀센', image_url: 'http://img/1.jpg', etc_otc_name: '일반의약품',
}
const throwDeps = {
  findLocalDrug: async () => { throw new Error('called') },
  findIngredients: async () => { throw new Error('called') },
  fetchLicense: async () => { throw new Error('called') },
}

test('resolveOneProduct: 검색어 2자 미만 → 미해결(원본 이름 보존, I/O 미호출)', async () => {
  const r = await resolveOneProduct('가', throwDeps)
  assert.equal(r.resolved, false)
  assert.equal(r.name, '가')
})
test('resolveOneProduct: 로컬 drugs 히트 → drug_id·성분 채움 (허가정보 미호출)', async () => {
  const r = await resolveOneProduct('타이레놀', {
    findLocalDrug: async () => localDrug,
    findIngredients: async () => ['아세트아미노펜', null],
    fetchLicense: async () => { throw new Error('허가정보 호출되면 안 됨') },
  })
  assert.equal(r.resolved, true)
  assert.equal(r.drug_id, 'drug-1')
  assert.equal(r.item_seq, '200101')
  assert.equal(r.ingredient, '아세트아미노펜')
  assert.equal(r.name, '타이레놀정500밀리그람')
})
test('resolveOneProduct: 로컬 미스 + 허가정보 히트 → item_seq만(정식품목)', async () => {
  const r = await resolveOneProduct('센트룸', {
    findLocalDrug: async () => null,
    findIngredients: async () => [],
    fetchLicense: async () => ({ ITEM_NAME: '센트룸우먼', ITEM_SEQ: '9988', ITEM_INGR_NAME: '비타민B군', PRDUCT_TYPE: '[02390]기타의 소화기관용약' }),
  })
  assert.equal(r.resolved, true)
  assert.equal(r.drug_id, null)
  assert.equal(r.item_seq, '9988')
  assert.equal(r.name, '센트룸우먼')
  assert.equal(r.category, '기타의 소화기관용약') // cleanCategory로 대괄호 코드 제거
})
test('resolveOneProduct: 로컬·허가정보 모두 미스 → 미해결', async () => {
  const r = await resolveOneProduct('없는제품명', {
    findLocalDrug: async () => null,
    findIngredients: async () => [],
    fetchLicense: async () => null,
  })
  assert.equal(r.resolved, false)
  assert.equal(r.name, '없는제품명')
  assert.equal(r.drug_id, null)
})

// ── mapLicenseToProduct / normalizeQuery (순수) ───────────────────
test('mapLicenseToProduct: ITEM_NAME 없으면 null(미해결 폴백)', () => {
  assert.equal(mapLicenseToProduct(null), null)
  assert.equal(mapLicenseToProduct({} as LicenseDetail), null)
  assert.equal(mapLicenseToProduct({ ITEM_SEQ: '1' } as LicenseDetail), null)
})
test('normalizeQuery: 괄호 주석 제거 + 트림', () => {
  assert.equal(normalizeQuery('타이레놀(아세트아미노펜) '), '타이레놀')
})

// ── assembleResponse (순수) ───────────────────────────────────────
test('assembleResponse: 해결된 게 있으면 그것만', () => {
  const hit = { ...emptyProduct('타이레놀'), resolved: true }
  const miss = emptyProduct('없는것')
  const out = assembleResponse('일반텍스트', ['타이레놀', '없는것'], [hit, miss])
  assert.equal(out.products.length, 1)
  assert.equal(out.products[0].resolved, true)
  assert.deepEqual(out.candidates, ['타이레놀', '없는것'])
})
test('assembleResponse: 전부 미해결 → 최상위 1개만(이름 검색 폴백)', () => {
  const out = assembleResponse('일반텍스트', ['가', '나'], [emptyProduct('가'), emptyProduct('나')])
  assert.equal(out.products.length, 1)
  assert.equal(out.products[0].name, '가')
})
test('assembleResponse: 처방전 어휘 감지 → isPrescription true', () => {
  assert.equal(assembleResponse('조제 교부일 투약일수', [], []).isPrescription, true)
  assert.equal(assembleResponse('센트룸 비타민', [], []).isPrescription, false)
})
