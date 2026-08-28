import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ingredientKey, splitIngredientName } from './ingredient-key.ts'

// 성분명 정규화 — DUR 성분쌍 규칙과 우리 drug_ingredients 를 잇는 유일한 키다.
// 규칙이 틀리면 두 방향으로 조용히 실패한다:
//   과잉 병합 → 서로 다른 약이 같은 키가 돼 **거짓 경고**(실버 사용자에게 음성 판정보다 나쁘다)
//   과소 병합 → 같은 약이 다른 키로 갈려 **조용한 누락**(경고가 그냥 안 뜬다)
// 아래 케이스는 운영 DB 실측(2026-08-28)으로 고른 것이므로 임의로 완화하지 말 것.

// ── 과소 병합 방지: 염·수화물 접미는 반복 제거해야 한다 ──
test('접미를 반복 제거한다 — 한 번만 떼면 같은 약이 두 키로 갈린다', () => {
  // 실측: Atorvastatin Calcium(122약) / Atorvastatin Calcium Trihydrate(666약)
  // 한 번만 제거하면 'atorvastatin' 과 'atorvastatin calcium' 으로 갈려 규칙이 절반에 안 닿는다
  assert.equal(ingredientKey('Atorvastatin Calcium'), 'atorvastatin')
  assert.equal(ingredientKey('Atorvastatin Calcium Trihydrate'), 'atorvastatin')
  assert.equal(ingredientKey('Atorvastatin Calcium Hydrate'), 'atorvastatin')
})

test('단순 염·수화물 접미 제거', () => {
  assert.equal(ingredientKey('Metformin Hydrochloride'), 'metformin')
  assert.equal(ingredientKey('Entecavir Monohydrate'), 'entecavir')
  assert.equal(ingredientKey('Tramadol Hydrochloride'), 'tramadol')
  assert.equal(ingredientKey('Rasagiline Mesylate'), 'rasagiline')
})

// ── 과잉 병합 방지: 무기물은 염이 활성 본체다 ──
test('제거 결과가 단독 무기물 양이온이면 제거 자체를 거부한다', () => {
  // 이걸 놓치면 칼륨제·칼슘제·마그네슘제가 서로 금기로 뜬다
  assert.equal(ingredientKey('Potassium Chloride'), 'potassium chloride')
  assert.equal(ingredientKey('Ferrous Sulfate'), 'ferrous sulfate')
  assert.equal(ingredientKey('Calcium Citrate'), 'calcium citrate')
  assert.equal(ingredientKey('Magnesium Oxide'), 'magnesium oxide')  // oxide 는 애초에 염 목록 밖
  assert.equal(ingredientKey('Zinc Sulfate'), 'zinc sulfate')
})

test('무기물 단독 표기는 그대로 둔다', () => {
  assert.equal(ingredientKey('Potassium'), 'potassium')
  assert.equal(ingredientKey('Magnesium'), 'magnesium')
})

// ── 방어 ──
test('제거 후 빈 문자열이 되면 원본을 유지한다', () => {
  assert.equal(ingredientKey('Sodium'), 'sodium')
  assert.equal(ingredientKey('Hydrate'), 'hydrate')
})

test('빈 값·공백은 빈 문자열', () => {
  assert.equal(ingredientKey(''), '')
  assert.equal(ingredientKey('   '), '')
  assert.equal(ingredientKey(null), '')
  assert.equal(ingredientKey(undefined), '')
})

test('대소문자·연속 공백을 정규화한다', () => {
  assert.equal(ingredientKey('  METFORMIN   HYDROCHLORIDE '), 'metformin')
})

test('끝의 로마숫자를 제거한다 (기존 enKey 규약 승계)', () => {
  assert.equal(ingredientKey('Cellulase II'), 'cellulase')
  assert.equal(ingredientKey('Protease IV'), 'protease')
})

// ── 비ASCII: 생약 엑스는 비율 표기에 서로 다른 틸드 3종을 쓴다(실측 486건) ──
test('틸드 3종·화살표를 같은 문자로 정규화한다', () => {
  const a = ingredientKey('Agastachis Herba Soft Extract (3.0~3.7→1)')
  const b = ingredientKey('Agastachis Herba Soft Extract (3.0∼3.7→1)')   // U+223C
  const c = ingredientKey('Agastachis Herba Soft Extract (3.0～3.7→1)')  // U+FF5E
  assert.equal(a, b)
  assert.equal(b, c)
  assert.ok(a.length > 0)
})

// ── `·` 는 결합 성분 구분자다 — 공백으로 바꿔 융합하면 두 성분이 하나가 된다 ──
test('가운뎃점은 성분 구분자로 분리한다', () => {
  const parts = splitIngredientName('L-Glutamic Acid·L-Lysine Salt (1:1) Dihydrate')
  assert.equal(parts.length, 2)
  assert.match(parts[0], /glutamic/i)
  assert.match(parts[1], /lysine/i)
})

test('구분자가 없으면 한 성분으로 돌려준다', () => {
  assert.deepEqual(splitIngredientName('Metformin Hydrochloride'), ['Metformin Hydrochloride'])
})

test('슬래시도 구분자다 (허가정보 복합제 표기)', () => {
  const parts = splitIngredientName('Rosuvastatin Calcium/Telmisartan')
  assert.equal(parts.length, 2)
})

// ── 멱등성: 같은 입력은 항상 같은 키 (정규식 lastIndex 누수 방지) ──
test('반복 호출이 같은 결과를 낸다', () => {
  for (let i = 0; i < 3; i++) {
    assert.equal(ingredientKey('Atorvastatin Calcium Trihydrate'), 'atorvastatin')
    assert.equal(ingredientKey('Potassium Chloride'), 'potassium chloride')
  }
})
