// OCR 이 읽은 약 이름을 식약처 품목명(`drugs.item_name`)에 맞추는 **순수** 규칙.
// DB 를 모른다 — 후보 목록을 받아서 "채택할지 / 사용자에게 물을지 / 포기할지"만 정한다.
// (DB 조회는 drug-name-resolve.ts 가 한다.)
//
// 왜 필요한가 — 2026-08-31 운영 실측:
// `user_medications` 에서 drug_id·supplement_id 가 둘 다 비어 custom_name 만 남은 행 53건이
// 전부 source='ocr' 이었다. 그 행들은 DUR 배지·e약은요·낱알식별·shadow 체크가 전부 불발한다.
// 실패 이름을 마스터와 대조하니 품목은 **다 있었다**. 버린 쪽은 매칭이었다:
//   ① 마스터 이름은 `콩코르정5밀리그램(비소프롤롤푸마르산염)` 처럼 함량+괄호 성분명이 붙는데
//      OCR 이 남긴 이름은 `콩코르정` 이라 정확일치도 부분일치도 유일하지 않다.
//   ② `놀텍정10밀리그램` 은 부분일치 후보가 2건인데 그중 하나가 `(수출용)` 이었다 —
//      "후보가 유일할 때만 채택" 규칙이 수출용 때문에 통째로 버렸다.
//   ③ `탈리부틴정200일리그램`(밀→일), `뮤테란캅셀`(캅셀/캡슐) 같은 표기·오인식 흔들림.
//
// ⚠️ 계율: **함량이 다른 후보 중 하나를 임의로 고르지 않는다.**
// `콩코르정` 에 5mg·2.5mg 이 있는데 아무거나 붙이면 사용자의 약이 실제와 다른 용량으로
// 기록된다. 잘못된 자동 매칭은 미매칭보다 나쁘다. 그래서 여럿이면 `ambiguous` 로 돌려
// 사용자가 고르게 한다(호출부가 후보 선택 UI 를 띄운다).

export type DrugCandidate = { id: string; item_name: string }

export type DrugNameMatch<T extends DrugCandidate = DrugCandidate> =
  | { kind: 'unique';    match: T; options: [] }        // 자동 채택 가능
  | { kind: 'ambiguous'; match: null; options: T[] }    // 사용자가 골라야 함
  | { kind: 'none';      match: null; options: [] }     // custom_name 폴백

// 함량 단위 표기 흔들림 흡수. 긴 것부터 치환해야 `밀리그램` 이 `그램` 으로 먼저 잘리지 않는다.
const UNIT_RULES: [RegExp, string][] = [
  [/마이크로그람|마이크로그램|㎍|mcg|μg/g, 'ug'],
  [/밀리그람|밀리그램|밀리그렘|㎎|mg/g,     'mg'],
  [/밀리리터|㎖|ml/g,                      'ml'],
  [/그람|그램/g,                           'g'],
  [/국제단위/g,                            'iu'],
]

// CLOVA 가 실제로 낸 오인식. 숫자 뒤에서만 고친다 — 제품명 안의 글자를 건드리면 안 된다.
// (`탈리부틴정200일리그램` ← `탈리부틴정200밀리그램`, 2026-08-31 운영 실측)
const OCR_UNIT_TYPOS: [RegExp, string][] = [
  [/(?<=\d\s*)일리그램|(?<=\d\s*)일리그람/g, 'mg'],
]

// 제형 표기 흔들림(허가 품목명은 `캡슐`, 처방전·OCR 은 `캅셀`/`캅슐` 이 섞여 나온다)
const FORM_ALIASES: [RegExp, string][] = [
  [/캅셀|캅슐/g, '캡슐'],
]

/** 이름 앞에 붙는 급여/비급여 등 대괄호·괄호 수식어 제거. `(비급여)고든…` → `고든…` */
function stripLeadingQualifier(s: string): string {
  let out = s
  for (;;) {
    const next = out.replace(/^\s*[([{][^)\]}]*[)\]}]\s*/, '')
    if (next === out) return out
    out = next
  }
}

/**
 * 비교용 정규화. 공백·대소문자·단위표기·제형표기를 통일한다.
 * 마스터에 실제로 존재하는 흔들림만 흡수한다(예: `울트라셋이알세미서방정 ` 끝 공백).
 */
export function normalizeDrugName(raw: string | null | undefined): string {
  if (!raw) return ''
  let s = String(raw).normalize('NFC')
  s = stripLeadingQualifier(s)
  s = s.replace(/[\s ]+/g, '')
  s = s.toLowerCase()
  for (const [re, to] of OCR_UNIT_TYPOS) s = s.replace(re, to)
  for (const [re, to] of FORM_ALIASES)   s = s.replace(re, to)
  for (const [re, to] of UNIT_RULES)     s = s.replace(re, to)
  s = s.replace(/[·‧・]/g, '')
  return s
}

/**
 * 괄호 앞까지의 "제품명+제형+함량". 마스터 이름의 괄호는 성분명·수출표기라
 * OCR 이 그대로 읽어오는 일이 드물다 — 비교는 여기서 한다.
 * `콩코르정5밀리그램(비소프롤롤푸마르산염)` → `콩코르정5mg`
 */
export function drugBaseName(raw: string | null | undefined): string {
  const n = normalizeDrugName(raw)
  if (!n) return ''
  const cut = n.search(/[([_{]/)
  return (cut >= 0 ? n.slice(0, cut) : n).replace(/[,/·-]+$/, '')
}

/**
 * DB 접두 조회용 키. **첫 숫자 또는 첫 괄호 앞까지** 자른다 — 함량을 빼고
 * 제품명+제형만 남겨 같은 계열 후보를 한 번에 긁어온다.
 * 공백은 마스터에 그대로 저장돼 있을 수 있으므로 지우지 않는다(내부 공백 보존).
 * 2글자 미만이면 접두 조회가 너무 광범위해 null(조회 생략).
 */
export function drugSearchPrefix(raw: string | null | undefined): string | null {
  if (!raw) return null
  let s = stripLeadingQualifier(String(raw).normalize('NFC')).replace(/[\s ]+/g, ' ').trim()
  for (const [re, to] of FORM_ALIASES) s = s.replace(re, to)
  const cut = s.search(/[0-9([_{]/)
  if (cut >= 0) s = s.slice(0, cut)
  s = s.replace(/[,/·\-\s]+$/, '').trim()
  return s.length >= 2 ? s : null
}

/** `(수출용)` · `(수출명: …)` 품목 — 국내 조제·복약 대상이 아니다. 후보에서 뺀다. */
export function isExportOnly(itemName: string | null | undefined): boolean {
  return /\(?수출용\)?|수출명/.test(String(itemName ?? ''))
}

/** 함량 표기가 이름에 들어 있는가 (`리바로정2mg` → true, `리바로정` → false) */
export function hasStrength(raw: string | null | undefined): boolean {
  return /\d/.test(drugBaseName(raw))
}

/**
 * OCR 이름 ↔ 마스터 후보 매칭.
 *
 * 판정 순서
 *  0. 수출용 후보 제거.
 *  1. 정규화 전체 일치가 1건 → unique (마스터 이름을 글자 그대로 읽은 경우)
 *  2. 괄호 앞(base) 일치가 1건 → unique. 2건 이상이면 ambiguous(그 후보들만)
 *  3. base 일치가 0건이면 남은 후보 전체로 판단 — 1건이면 unique, 2건 이상이면 ambiguous
 *  4. 후보가 없으면 none
 *
 * 3의 "1건이면 채택"은 기존 규칙(부분일치 후보가 유일할 때만 채택)과 같은 강도다.
 * 함량 추측이 되는 지점은 오직 2·3의 **여럿**이고, 거기서는 반드시 ambiguous 로 넘긴다.
 */
export function matchDrugName<T extends DrugCandidate>(
  query: string | null | undefined,
  candidates: readonly T[],
): DrugNameMatch<T> {
  const qn = normalizeDrugName(query)
  const qb = drugBaseName(query)
  if (!qn) return { kind: 'none', match: null, options: [] }

  const pool = candidates.filter(c => c?.item_name && !isExportOnly(c.item_name))
  if (pool.length === 0) return { kind: 'none', match: null, options: [] }

  const full = pool.filter(c => normalizeDrugName(c.item_name) === qn)
  if (full.length === 1) return { kind: 'unique', match: full[0], options: [] }

  // ⚠️ 질의에 **함량이 없는데** 같은 계열에 후보가 여럿이면 채택하지 않는다.
  //
  // `코자정` 계열에는 `코자정(로사르탄칼륨)` 과 `코자정100밀리그램(로사르탄칼륨)` 이 **둘 다** 산다.
  // base 일치만 보면 앞쪽이 유일해져 자동 채택되는데, 처방이 100밀리그램이었고 OCR 이 함량을
  // 흘렸다면 **다른 함량이 사용자의 약으로 기록된다.** 미매칭보다 나쁘다.
  // (같은 형태: `레보클점안액` vs `레보클점안액1.5%`. 실측 2026-08-31.)
  //
  // 질의에 함량이 있으면 이 위험이 없다 — 그 함량으로 후보가 이미 좁혀졌기 때문이다.
  if (!hasStrength(query) && pool.length > 1) {
    return { kind: 'ambiguous', match: null, options: pool }
  }

  const base = qb ? pool.filter(c => drugBaseName(c.item_name) === qb) : []
  const set = base.length > 0 ? base : pool

  if (set.length === 1) return { kind: 'unique', match: set[0], options: [] }
  return { kind: 'ambiguous', match: null, options: set }
}
