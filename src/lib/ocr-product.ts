// 박스 OCR → 제품명 추출·품목 해결의 폴백 오케스트레이션 (외부 I/O는 주입 → 단위테스트 가능).
// route.ts가 이 모듈을 SSOT로 쓰고, CLOVA/GPT/식약처 fetch·Supabase 쿼리만 어댑터로 주입한다.
import { pickNamesHeuristic, cleanCategory, looksLikePrescription } from './ocr-classify.ts'

export type ResolvedProduct = {
  name: string; ingredient: string | null; drug_id: string | null; item_seq: string | null
  entp_name: string | null; image_url: string | null; category: string | null
  classType: string | null; resolved: boolean
}

export type LicenseDetail = {
  ITEM_SEQ?: string; ITEM_NAME?: string; ENTP_NAME?: string; ITEM_INGR_NAME?: string
  SPCLTY_PBLC?: string; PRDUCT_TYPE?: string; BIG_PRDT_IMG_URL?: string
}

export type LocalDrug = {
  id: string; item_seq: string | null; item_name: string
  entp_name: string | null; image_url: string | null; etc_otc_name: string | null
}

export const BOX_PROMPT = `다음은 일반의약품 또는 건강기능식품 "제품 박스"를 OCR로 읽은 텍스트야. 여기서 사람이 검색할 만한 제품명(상품명) 후보를 가장 그럴듯한 순서로 1~3개 뽑아줘.

Return ONLY a JSON object: { "names": ["제품명1", "제품명2"] }
규칙:
- 상품명(브랜드+제품명)만. 예: "타이레놀정500밀리그람", "센트룸 우먼", "고려은단 비타민C".
- 제조사·판매사명 단독, 성분 나열, 함량/용량(mg·g·정·캡슐 수), 효능·효과 문구, "건강기능식품"·"일반의약품" 같은 분류어, 바코드/숫자열, 영양정보표는 제외.
- 한국 제품이면 한글 상품명을 우선. 영문 병기는 핵심 단어만.
- 가장 확실한 후보를 배열 첫 번째에 둘 것. 없으면 빈 배열.
- 정확히 이 JSON 형태만 반환. 다른 필드 금지.`

export function isValidOpenAiKey(key: string | undefined): boolean {
  return typeof key === 'string' && key.startsWith('sk-') && key.length > 20
}

// GPT 응답의 names 배열을 정제(문자열·길이 필터 + 최대 3). 순수 함수.
export function cleanGptNames(parsed: unknown): string[] {
  const raw = (parsed as { names?: unknown })?.names
  const names = Array.isArray(raw) ? raw : []
  return names
    .filter((n: unknown): n is string => typeof n === 'string')
    .map((n) => n.trim())
    .filter((n) => n.length >= 2 && n.length <= 40)
    .slice(0, 3)
}

// GPT로 이름 추출. 키 없음·HTTP 실패·파싱 실패·빈 결과 등 전 구간에서 heuristic으로 폴백.
export async function extractNames(
  rawText: string,
  opts: { key?: string; fetchImpl?: typeof fetch } = {},
): Promise<string[]> {
  const { key = process.env.OPENAI_API_KEY, fetchImpl = fetch } = opts
  if (!isValidOpenAiKey(key)) return pickNamesHeuristic(rawText)

  try {
    const res = await fetchImpl('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'developer', content: BOX_PROMPT },
          { role: 'user', content: rawText.slice(0, 4000) },
        ],
        max_tokens: 200,
        temperature: 0,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok) return pickNamesHeuristic(rawText)
    const json = await res.json()
    const content = json.choices?.[0]?.message?.content ?? '{}'
    const clean = cleanGptNames(JSON.parse(content))
    return clean.length > 0 ? clean : pickNamesHeuristic(rawText)
  } catch {
    return pickNamesHeuristic(rawText)
  }
}

// 괄호 주석 제거 + 트림 (로컬/허가정보 검색어 정규화)
export function normalizeQuery(rawName: string): string {
  return rawName.replace(/\([^)]*\)/g, '').trim()
}

export function emptyProduct(rawName: string): ResolvedProduct {
  return {
    name: rawName, ingredient: null, drug_id: null, item_seq: null,
    entp_name: null, image_url: null, category: null, classType: null, resolved: false,
  }
}

// 로컬 drugs 행 + 성분명 목록 → ResolvedProduct (순수)
export function mapLocalDrug(local: LocalDrug, ingredientNames: (string | null | undefined)[]): ResolvedProduct {
  const ingredient = ingredientNames.filter(Boolean).join(', ') || null
  return {
    name: local.item_name, ingredient, drug_id: local.id, item_seq: local.item_seq ?? null,
    entp_name: local.entp_name ?? null, image_url: local.image_url ?? null,
    category: null, classType: local.etc_otc_name ?? null, resolved: true,
  }
}

// 식약처 허가정보 → ResolvedProduct. ITEM_NAME 없으면 null (미해결로 폴백). 순수.
export function mapLicenseToProduct(lic: LicenseDetail | null): ResolvedProduct | null {
  if (!lic?.ITEM_NAME) return null
  return {
    name: lic.ITEM_NAME, ingredient: lic.ITEM_INGR_NAME ?? null,
    drug_id: null, item_seq: lic.ITEM_SEQ ?? null, entp_name: lic.ENTP_NAME ?? null,
    image_url: lic.BIG_PRDT_IMG_URL ?? null, category: cleanCategory(lic.PRDUCT_TYPE),
    classType: lic.SPCLTY_PBLC ?? null, resolved: true,
  }
}

// 이름 1개 → 로컬 drugs(성분 조인) 우선 → 허가정보 API 폴백 → 미해결. I/O는 주입.
export async function resolveOneProduct(
  rawName: string,
  deps: {
    findLocalDrug: (q: string) => Promise<LocalDrug | null>
    findIngredients: (drugId: string) => Promise<(string | null | undefined)[]>
    fetchLicense: (q: string) => Promise<LicenseDetail | null>
  },
): Promise<ResolvedProduct> {
  const q = normalizeQuery(rawName)
  if (q.length < 2) return emptyProduct(rawName)

  const local = await deps.findLocalDrug(q)
  if (local) return mapLocalDrug(local, await deps.findIngredients(local.id))

  const lic = await deps.fetchLicense(q)
  return mapLicenseToProduct(lic) ?? emptyProduct(rawName)
}

// 해결결과 배열 → 응답 본문. 해결된 게 있으면 그것만, 없으면 최상위 1개(이름 검색 폴백). 순수.
export function assembleResponse(rawText: string, names: string[], resolvedAll: ResolvedProduct[]) {
  const hit = resolvedAll.filter((p) => p.resolved)
  const products = hit.length > 0 ? hit : resolvedAll.slice(0, 1)
  return { products, candidates: names, isPrescription: looksLikePrescription(rawText) }
}
