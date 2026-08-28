// 성분명 정규화 — DUR 성분쌍 규칙(ingredient_interactions)과 우리 drug_ingredients 를 잇는 유일한 키.
//
// 왜 필요한가: 식약처 DUR API 는 병용금기를 **성분 영문명**으로 준다
// (INGR_ENG_NAME:"Itraconazole" ↔ MIXTURE_INGR_ENG_NAME:"Simvastatin", 2026-08-28 실호출).
// 우리 drug_ingredients.name_en 도 같은 허가정보 원천이라 어휘가 같지만, 염·수화물 표기가
// 제품마다 흔들린다(Atorvastatin Calcium / … Calcium Hydrate / … Calcium Trihydrate).
// 그 흔들림을 접어야 규칙이 제품에 닿는다.
//
// 실패는 양방향이고 둘 다 조용하다:
//   과잉 병합 → 서로 다른 약이 같은 키 → **거짓 경고**
//   과소 병합 → 같은 약이 다른 키   → **누락**(경고가 그냥 안 뜬다)
// 그래서 규칙은 ingredient-key.test.ts 가 운영 실측 케이스로 고정한다. 완화하지 말 것.
//
// ⚠️ 이 키는 저장하지 않고 조회 시점에 매핑 테이블(ingredient_norms)을 거쳐 쓴다 —
//    규칙이 바뀌면 4,369행 매핑만 다시 쓰면 되고, 91,507 성분 위치를 재계산하지 않는다.

// 접미 염·에스테르·수화물. **접두는 절대 건드리지 않는다**(Sodium Valproate 의 sodium 은 본체가 아니지만
// 접두 제거는 판단이 필요해 규칙으로 못 박을 수 없다 — 필요하면 ingredient_norms 에 수동 매핑).
const SALT_SUFFIX = /\s+(hydrochloride|hcl|sodium|potassium|calcium|magnesium|sulfate|sulphate|phosphate|maleate|tartrate|besylate|besilate|mesylate|mesilate|succinate|fumarate|citrate|acetate|nitrate|bromide|chloride|monohydrate|dihydrate|trihydrate|tetrahydrate|hemihydrate|hydrate|anhydrous)$/

// 제거 결과가 이것들 중 하나가 되면 **제거를 거부**한다 — 무기물은 염이 활성 본체다.
// Potassium Chloride 를 potassium 으로 접으면 칼륨제와 칼슘제가 서로 금기로 뜬다.
// (대가도 있다: magnesium 10변이·zinc 6변이가 서로 다른 키로 남아 한 염의 규칙이 나머지에 안 닿는다.
//  그 미도달 수는 ETL 리포트가 출력해 약사 검수로 판단한다.)
const INORGANIC_CATION = new Set([
  'potassium', 'calcium', 'sodium', 'magnesium', 'ferrous', 'ferric', 'zinc', 'iron',
  'ammonium', 'aluminum', 'aluminium', 'lithium', 'chromium', 'selenium', 'manganese',
  'copper', 'molybdenum', 'iodine', 'phosphorus',
])

const ROMAN_SUFFIX = /\s+(i{1,3}|iv|v|vi{1,3})$/

// 생약 엑스는 비율 표기에 서로 다른 틸드를 섞어 쓴다(실측 486건: U+007E · U+223C · U+FF5E).
// 같은 성분이 코드포인트 차이로 다른 키가 되지 않게 한 글자로 접는다.
function unifySymbols(s: string): string {
  return s.replace(/[∼～]/g, '~').replace(/[→－]/g, '-')
}

/**
 * 성분명 하나를 정규화 키로 접는다. 입력이 비면 빈 문자열.
 */
export function ingredientKey(raw: string | null | undefined): string {
  if (!raw) return ''
  let s = unifySymbols(String(raw)).toLowerCase().replace(/\s+/g, ' ').trim()
  if (!s) return ''
  s = s.replace(ROMAN_SUFFIX, '').trim()

  // 반복 제거 — 한 번만 떼면 "atorvastatin calcium trihydrate" 가 "atorvastatin calcium" 에서 멈춘다.
  for (;;) {
    const cand = s.replace(SALT_SUFFIX, '').trim()
    // 더 뗄 게 없거나 / 빈 값이 되거나 / 단독 무기물이 되면 **직전 값을 유지**한다.
    // (제거 후 탈출이 아니라 제거 거부 — 순서를 바꾸면 potassium chloride 가 potassium 으로 붕괴한다.)
    if (cand === s || cand === '' || INORGANIC_CATION.has(cand)) break
    s = cand
  }
  return s
}

// 허가정보의 복합제 표기는 `/` 로 성분을 나열하고, 결합염은 `·` 로 두 성분을 잇는다
// (예: "L-Glutamic Acid·L-Lysine Salt (1:1) Dihydrate" 는 두 성분이다).
// 기존 enKey 는 `·` 를 공백으로 바꿔 하나로 융합시켰다 — 그러면 어느 쪽 규칙에도 안 닿는다.
const NAME_SEPARATOR = /[/·・]/

/**
 * 성분명 문자열을 개별 성분으로 나눈다(정규화는 하지 않는다 — 표시용 원문 보존).
 */
export function splitIngredientName(raw: string | null | undefined): string[] {
  if (!raw) return []
  const parts = unifySymbols(String(raw))
    .split(NAME_SEPARATOR)
    .map(p => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  return parts.length > 0 ? parts : []
}
