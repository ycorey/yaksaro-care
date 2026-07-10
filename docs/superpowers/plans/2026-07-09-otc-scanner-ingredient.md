# OTC 통합 인식 + 성분 표시 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 일반약통(OTC 박스) 촬영 시 처방전으로 오분류돼 재시작되던 문제를 없애고, 제품명+성분을 확실히 인식해 OTC 전용 간소 화면으로 담게 한다.

**Architecture:** `/api/ocr/product` 라우트가 인식 브레인이 되어 (1) 강화된 신호로 처방전 여부를 판정하고 (2) 제품명 후보를 로컬 `drugs`+`drug_ingredients` 및 허가정보 API로 조회해 성분·정식 품목까지 해결한 구조화 결과를 반환한다. `box-ocr-scanner.tsx`는 그 결과를 OTC 전용 카드로 보여주고, 확인 시 기존 `AddForm`에 정식 품목을 `initialSelected`로 넘겨 저장한다. 처방전 경로(`/api/ocr`, `ocr-uploader.tsx`)는 건드리지 않는다.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase(server client), NAVER CLOVA OCR, GPT-4o-mini, 식약처 허가정보 API.

## Global Constraints

- 처방전 흐름(`/api/ocr`, `src/app/medications/ocr/*`)은 **무변경**. 회귀 금지.
- 색상은 YC 토큰만 사용(하드코딩 hex 금지). 카드 = `bg-white rounded-yc-lg border border-yc-neutral200` 관습 준수.
- 외부 API/성분 조회 실패는 항상 200 + `resolved:false`로 흡수. 하드 실패로 재촬영 루프 유도 금지.
- Supabase `select('*')` 금지 — 소비 컬럼만 명시.
- 인식된 정식 품목은 `drug_id`/`item_seq`를 붙여 저장(custom_name 회피 → DUR 투입).
- tsc·lint·next build 통과가 완료 기준.

---

### Task 1: 처방전 판정 강화 — `looksLikePrescription`

**문제:** 현재 `RX_SIGNALS`는 "1일 3회", "식후" 문구 2개면 처방전 판정 → 일반약통 오분류. 처방전 특유 어휘/대괄호 EDI만 강한 신호로 삼는다.

**Files:**
- Modify: `src/app/api/ocr/product/route.ts:57-67` (`RX_SIGNALS`, `looksLikePrescription` 교체)

**Interfaces:**
- Produces: `looksLikePrescription(rawText: string): boolean` — 처방전/약봉투 특유 신호가 있을 때만 true.

**판정 진리표 (구현 후 눈으로 검증):**

| rawText 발췌 | 기대값 | 근거 |
|---|---|---|
| `타이레놀정500밀리그람 1일 3회 식후 30분 복용` | `false` | OTC 박스 문구, 처방전 어휘 없음 |
| `[671701890] 아모잘탄정 총투약일수 5 1일투여횟수 3` | `true` | 대괄호 9자리 EDI + `총투약일수` |
| `○○약국 조제 교부일 ...` | `true` | `조제`·`교부일` |
| `건강기능식품 비타민C 1000mg 1일 1회` | `false` | 건기식 박스, 처방전 어휘 없음 |
| 13자리 바코드 `8801234567890` 포함 OTC 박스 | `false` | 대괄호 없는 숫자열은 EDI로 안 봄 |

- [ ] **Step 1: `RX_SIGNALS`/`looksLikePrescription`를 강한 신호 버전으로 교체**

`src/app/api/ocr/product/route.ts`의 57~67줄(주석 포함 `RX_SIGNALS` 배열 ~ `looksLikePrescription` 함수)을 아래로 교체:

```ts
// 처방전/약봉투 판정 — 처방전 서식 특유 어휘 또는 대괄호 9자리 EDI 코드가 있을 때만 true.
// 일반약통 박스의 "1일 3회·식후 복용" 문구만으로는 처방전으로 보지 않는다(오분류 방지).
// 13자리 바코드는 대괄호가 없어 EDI로 오인하지 않는다.
const RX_EDI_RE    = /\[\s*\d{9}\s*\]/                                  // [671701890]
const RX_STRONG_RE = /조제|처방전|요양기관|교부일|투약일수|본인부담|1일\s*투여\s*횟수|1회\s*투약량/
function looksLikePrescription(rawText: string): boolean {
  return RX_EDI_RE.test(rawText) || RX_STRONG_RE.test(rawText)
}
```

- [ ] **Step 2: 타입 확인**

Run: `npx tsc --noEmit`
Expected: 에러 0 (해당 파일 관련 신규 에러 없음)

- [ ] **Step 3: 진리표 대조 커밋**

위 진리표의 5개 케이스를 함수 로직으로 손검증(정규식 매칭 여부)한 뒤 커밋.

```bash
git add src/app/api/ocr/product/route.ts
git commit -m "fix(ocr): 처방전 판정을 강한 신호(EDI·조제 어휘)로 한정 — 일반약통 오분류 방지"
```

---

### Task 2: 제품명 → 성분·정식 품목 해결 + 라우트 반환 구조 변경

**Files:**
- Modify: `src/app/api/ocr/product/route.ts` (`resolveProduct` 헬퍼 추가, `POST` 반환 구조 변경)

**Interfaces:**
- Consumes: `looksLikePrescription`(Task 1), 기존 `runClovaOcr`, `extractNamesWithGpt`.
- Produces: `POST /api/ocr/product` 응답
  ```ts
  {
    products: Array<{
      name: string; ingredient: string | null; drug_id: string | null; item_seq: string | null;
      entp_name: string | null; image_url: string | null; category: string | null;
      classType: string | null; resolved: boolean
    }>;
    candidates: string[];
    isPrescription: boolean
  }
  ```

- [ ] **Step 1: 허가정보 상세 조회 헬퍼 추가**

`route.ts` 상단(기존 `extractNamesWithGpt` 아래)에 추가. 성분·분류·전문일반·이미지·item_seq를 가져온다.

```ts
type LicenseDetail = {
  ITEM_SEQ?: string; ITEM_NAME?: string; ENTP_NAME?: string; ITEM_INGR_NAME?: string
  SPCLTY_PBLC?: string; PRDUCT_TYPE?: string; BIG_PRDT_IMG_URL?: string
}
async function fetchLicenseByName(itemName: string): Promise<LicenseDetail | null> {
  const key = process.env.MFDS_DRUG_LICENSE_KEY
  if (!key) return null
  const url = 'https://apis.data.go.kr/1471000/DrugPrdtPrmsnInfoService07/getDrugPrdtPrmsnInq07'
    + `?serviceKey=${encodeURIComponent(key)}&item_name=${encodeURIComponent(itemName)}&numOfRows=1&pageNo=1&type=json`
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) })
    if (!res.ok) return null
    const json  = await res.json()
    const items = json?.body?.items
    const first = Array.isArray(items) ? items[0] : items
    return (first as LicenseDetail) ?? null
  } catch { return null }
}
// "[02390]기타의 소화기관용약" → "기타의 소화기관용약"
function cleanCategory(t?: string): string | null {
  if (!t) return null
  return t.replace(/^\[[^\]]*\]/, '').trim() || null
}
```

- [ ] **Step 2: `resolveProduct` 헬퍼 추가 (로컬 우선 → 허가정보 폴백)**

`route.ts`에 추가. `SupabaseClient` 타입은 `createClient` 반환을 그대로 받도록 제네릭 회피 위해 `Awaited<ReturnType<typeof createClient>>` 사용.

```ts
type ResolvedProduct = {
  name: string; ingredient: string | null; drug_id: string | null; item_seq: string | null
  entp_name: string | null; image_url: string | null; category: string | null
  classType: string | null; resolved: boolean
}

async function resolveProduct(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rawName: string,
): Promise<ResolvedProduct> {
  const q = rawName.replace(/\([^)]*\)/g, '').trim()
  const empty: ResolvedProduct = {
    name: rawName, ingredient: null, drug_id: null, item_seq: null,
    entp_name: null, image_url: null, category: null, classType: null, resolved: false,
  }
  if (q.length < 2) return empty

  // 1) 로컬 drugs: prefix 우선, 없으면 contains. 취소품목 제외.
  const { data: local } = await supabase
    .from('drugs')
    .select('id, item_seq, item_name, entp_name, image_url, etc_otc_name')
    .eq('is_canceled', false)
    .or(`item_name.ilike.${q}%,item_name.ilike.%${q}%`)
    .limit(1)
    .maybeSingle()

  if (local) {
    const { data: ings } = await supabase
      .from('drug_ingredients')
      .select('name_ko, name_en, position')
      .eq('drug_id', local.id)
      .order('position')
    const ingredient = (ings ?? [])
      .map(x => x.name_ko || x.name_en)
      .filter(Boolean)
      .join(', ') || null
    return {
      name: local.item_name, ingredient, drug_id: local.id, item_seq: local.item_seq ?? null,
      entp_name: local.entp_name ?? null, image_url: local.image_url ?? null,
      category: null, classType: local.etc_otc_name ?? null, resolved: true,
    }
  }

  // 2) 허가정보 API 폴백
  const lic = await fetchLicenseByName(q)
  if (lic?.ITEM_NAME) {
    return {
      name: lic.ITEM_NAME, ingredient: lic.ITEM_INGR_NAME ?? null,
      drug_id: null, item_seq: lic.ITEM_SEQ ?? null, entp_name: lic.ENTP_NAME ?? null,
      image_url: lic.BIG_PRDT_IMG_URL ?? null, category: cleanCategory(lic.PRDUCT_TYPE),
      classType: lic.SPCLTY_PBLC ?? null, resolved: true,
    }
  }
  return empty
}
```

- [ ] **Step 3: `POST` 핸들러 반환 구조 변경**

`route.ts`의 `POST` 함수 끝부분 `try` 블록(기존 `const rawText = ...` ~ `return NextResponse.json({ names, isPrescription: ... })` 과 `catch`)을 아래로 교체. `supabase`는 함수 상단에서 이미 생성돼 있음.

```ts
  try {
    const rawText = await runClovaOcr(bytes, mime, ext)
    if (!rawText) return NextResponse.json({ products: [], candidates: [], isPrescription: false })

    const names = await extractNamesWithGpt(rawText)          // string[] (최대 3)
    const resolvedAll = await Promise.all(names.slice(0, 3).map(n => resolveProduct(supabase, n)))
    const hit = resolvedAll.filter(p => p.resolved)
    // 해결된 게 없으면 최상위 후보 1개라도 이름으로 넘겨 검색 폴백(막다른 길 방지)
    const products = hit.length > 0 ? hit : resolvedAll.slice(0, 1)

    return NextResponse.json({
      products,
      candidates: names,
      isPrescription: looksLikePrescription(rawText),
    })
  } catch (e) {
    logger.error('OCR', '박스 인식 오류', e)
    return NextResponse.json({ products: [], candidates: [], isPrescription: false, error: 'ocr_failed' }, { status: 200 })
  }
```

- [ ] **Step 4: 타입 확인**

Run: `npx tsc --noEmit`
Expected: 에러 0

- [ ] **Step 5: 커밋**

```bash
git add src/app/api/ocr/product/route.ts
git commit -m "feat(ocr): 박스 인식기가 제품명→성분·정식품목까지 해결해 구조화 반환"
```

---

### Task 3: OTC 전용 간소 결과 화면 (`box-ocr-scanner.tsx`)

**Files:**
- Modify: `src/app/medications/add/box-ocr-scanner.tsx`
- Modify: `src/app/medications/add/add-form.tsx` (필요 시 `Selected` export 확인 — 이미 export됨)

**Interfaces:**
- Consumes: Task 2의 `/api/ocr/product` 응답(`products`, `candidates`, `isPrescription`).
- Consumes: `AddForm`의 `initialSelected?: Selected` prop, `Selected` 타입(export됨).
- Produces: OTC 결과 UI(파일 내부, 외부 계약 없음).

- [ ] **Step 1: `Selected` 타입 import + 제품 타입/상태 정의**

`box-ocr-scanner.tsx` 상단 import에 추가:

```ts
import AddForm, { type Selected } from './add-form'
```
(기존 `import AddForm from './add-form'` 를 위 줄로 교체.)

컴포넌트 최상단 타입 추가(파일 상단, `type Phase` 근처):

```ts
type ResolvedProduct = {
  name: string; ingredient: string | null; drug_id: string | null; item_seq: string | null
  entp_name: string | null; image_url: string | null; category: string | null
  classType: string | null; resolved: boolean
}
```

- [ ] **Step 2: 상태를 새 응답 구조에 맞게 교체**

`BoxOcrAddFlow` 내부 상태 선언에서 기존 `const [candidates, setCandidates] = useState<string[]>([])` 아래에 추가하고, `query` 상태는 유지:

```ts
  const [products, setProducts] = useState<ResolvedProduct[]>([])
  const [picked,   setPicked]   = useState<ResolvedProduct | null>(null)  // "이 약이 맞아요" 선택분
```

- [ ] **Step 3: `runRecognition`을 새 응답 구조로 갱신**

기존 `runRecognition`의 `const data = await res.json()...` 이후 분기 전체를 아래로 교체:

```ts
      const data = await res.json().catch(() => ({}))
      const prods: ResolvedProduct[] = Array.isArray(data?.products) ? data.products : []
      const names: string[] = Array.isArray(data?.candidates) ? data.candidates : []
      setLooksRx(!!data?.isPrescription)
      setProducts(prods)
      setCandidates(names)
      setPicked(null)

      if (data?.isPrescription) {
        toast.success('여러 약이 적힌 약봉투 같아요.')
      } else if (prods.some(p => p.resolved)) {
        setQuery(prods.find(p => p.resolved)!.name)
        toast.success('약을 찾았어요. 맞는지 확인해 주세요.')
      } else if (names.length > 0) {
        setQuery(names[0])
        toast.success('제품명을 읽었어요. 검색 결과에서 골라 주세요.')
      } else {
        toast.error('제품명을 못 읽었어요. 이름으로 검색해 주세요.')
      }
```

- [ ] **Step 4: 정식 품목 → `Selected` 변환 헬퍼 추가**

`BoxOcrAddFlow` 내부(함수들 사이)에 추가:

```ts
  // 해결된 정식 품목을 AddForm의 선택완료(Selected) 형태로 — 검색 생략하고 바로 담기
  function toSelected(p: ResolvedProduct): Selected | null {
    if (!p.resolved) return null
    if (p.drug_id) {
      return { type: 'drug', id: p.drug_id, item_seq: p.item_seq, name: p.name,
               sub: p.entp_name ?? '', source: 'db', imageUrl: p.image_url }
    }
    if (p.item_seq) {
      return { type: 'drug', id: p.item_seq, item_seq: p.item_seq, name: p.name,
               sub: p.entp_name ?? '', source: 'api', imageUrl: p.image_url }
    }
    return null
  }
```

- [ ] **Step 5: form 단계 렌더링을 OTC 전용 화면으로 교체**

기존 `if (phase === 'form') { ... }` 블록 전체를 아래로 교체. (약봉투 핸드오프 카드는 유지, 그 아래를 3분기: 선택완료→AddForm(initialSelected) / 해결됨→OTC 카드 / 미해결→검색폼)

```tsx
  if (phase === 'form') {
    const resolvedProducts = products.filter(p => p.resolved)
    const selected = picked ? toSelected(picked) : null
    return (
      <div className="space-y-5 anim-scale-in">
        <StepHeader title={initialTab === 'supplement' ? '영양제 · 보조제' : '일반의약품'} member={member} />

        {looksRx && (
          <div className="rounded-yc-xl border border-yc-green200 bg-yc-green50 px-5 py-4 space-y-3">
            <div className="flex items-start gap-2.5">
              <FileText weight="fill" size={20} className="text-yc-green700 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-yc-neutral800 leading-relaxed break-keep">
                여러 약이 적힌 <b>약봉투·처방전</b> 같아요. 처방전으로 읽으면 <b>약마다 확인·수정</b>하고 한 번에 담을 수 있어요.
              </p>
            </div>
            <button type="button" onClick={handoffToPrescription}
              className="w-full h-12 rounded-yc-lg bg-yc-green600 text-white text-base font-semibold active:bg-yc-green700 transition-colors">
              처방전으로 정확히 읽기
            </button>
          </div>
        )}

        {/* 정식 품목 확인 완료 → 검색 생략하고 바로 폼(선택완료 상태) */}
        {selected ? (
          <>
            {picked?.ingredient && (
              <div className="rounded-yc-lg bg-yc-green50 border border-yc-green100 px-4 py-3">
                <p className="text-xs font-bold text-yc-green700 mb-0.5">성분</p>
                <p className="text-sm text-yc-neutral800 break-keep">{picked.ingredient}</p>
              </div>
            )}
            <AddForm key={selected.name} initialTab={initialTab} initialSelected={selected} />
          </>
        ) : resolvedProducts.length > 0 ? (
          /* ── OTC 전용 간소 화면: 인식된 약 확인 ── */
          <div className="space-y-4">
            {candidates.length > 1 && (
              <div className="space-y-1.5">
                <p className="text-xs text-yc-neutral500">다른 약으로 읽혔다면 눌러서 바꿔요</p>
                <div className="flex flex-wrap gap-1.5">
                  {resolvedProducts.map((p, i) => (
                    <button key={`${p.name}-${i}`} type="button" onClick={() => setQuery(p.name)}
                      className={`text-sm px-3 py-2 rounded-full border transition-colors ${p.name === query ? 'bg-yc-green600 text-white border-yc-green600' : 'bg-white text-yc-neutral700 border-yc-neutral200 active:bg-yc-neutral50'}`}>
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {(() => {
              const p = resolvedProducts.find(x => x.name === query) ?? resolvedProducts[0]
              return (
                <div className="rounded-yc-xl border border-yc-neutral200 bg-white overflow-hidden shadow-[var(--yc-shadow-sm)]">
                  <div className="flex items-start gap-4 p-5">
                    <div className="w-20 h-20 rounded-yc-lg bg-yc-neutral50 overflow-hidden flex items-center justify-center flex-shrink-0">
                      {p.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img loading="lazy" decoding="async" src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                      ) : <Pill weight="fill" size={28} className="text-yc-green600 opacity-60" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-lg font-bold text-yc-neutral900 leading-tight break-keep">{p.name}</p>
                      {p.entp_name && <p className="text-xs text-yc-neutral500 mt-0.5">{p.entp_name}</p>}
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {p.category  && <span className="text-xs bg-yc-green50 text-yc-green700 rounded-full px-2.5 py-0.5">{p.category}</span>}
                        {p.classType && <span className="text-xs bg-yc-neutral100 text-yc-neutral500 rounded-full px-2.5 py-0.5">{p.classType}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="px-5 pb-4">
                    <p className="text-xs font-bold text-yc-neutral500 mb-1">성분</p>
                    <p className="text-sm text-yc-neutral800 break-keep">{p.ingredient ?? '성분 정보 없음'}</p>
                  </div>
                  <button type="button" onClick={() => setPicked(p)}
                    className="w-full h-14 bg-yc-green600 text-white text-base font-semibold active:bg-yc-green700 transition-colors flex items-center justify-center gap-2">
                    <Check weight="bold" size={18} /> 이 약이 맞아요
                  </button>
                </div>
              )
            })()}
            <button type="button" onClick={() => { setPicked(null); setProducts([]) }}
              className="min-h-[44px] w-full flex items-center justify-center text-sm font-medium text-yc-neutral600 underline active:opacity-70">
              다른 이름으로 직접 검색
            </button>
          </div>
        ) : (
          /* ── 미해결: 읽은 이름으로 검색 폴백 (재시작 루프 없음) ── */
          <>
            {query && (
              <p className="text-sm text-yc-green700 bg-yc-green100 rounded-yc-md px-4 py-3">
                박스에서 <b>&quot;{query}&quot;</b>를 읽었어요. 검색 결과에서 맞는 제품을 골라 주세요.
              </p>
            )}
            {candidates.length > 1 && (
              <div className="space-y-1.5">
                <p className="text-xs text-yc-neutral500">다른 이름으로 읽혔다면 눌러서 바꿔요</p>
                <div className="flex flex-wrap gap-1.5">
                  {candidates.map(c => (
                    <button key={c} type="button" onClick={() => setQuery(c)}
                      className={`text-sm px-3 py-2 rounded-full border transition-colors ${c === query ? 'bg-yc-green600 text-white border-yc-green600' : 'bg-white text-yc-neutral700 border-yc-neutral200 active:bg-yc-neutral50'}`}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <AddForm key={query} initialTab={initialTab} initialQuery={query || undefined} />
          </>
        )}
      </div>
    )
  }
```

- [ ] **Step 6: 아이콘 import 확인**

`box-ocr-scanner.tsx`의 `@phosphor-icons/react` import에 `Pill`, `Check`가 포함돼야 함. 기존 `import { Camera, Images, CircleNotch, FileText } from '@phosphor-icons/react'` 를 아래로 교체:

```ts
import { Camera, Images, CircleNotch, FileText, Pill, Check } from '@phosphor-icons/react'
```

- [ ] **Step 7: 타입·린트 확인**

Run: `npx tsc --noEmit && npm run lint`
Expected: 에러 0, 워닝 0

- [ ] **Step 8: 커밋**

```bash
git add src/app/medications/add/box-ocr-scanner.tsx
git commit -m "feat(ocr): OTC 전용 간소 확인 화면 — 인식된 약·성분 표시 후 바로 담기"
```

---

### Task 4: 통합 검증 (빌드 + 수동 스모크)

**Files:** 없음(검증 전용)

- [ ] **Step 1: 프로덕션 빌드**

Run: `npm run build`
Expected: 성공(에러 0). `/api/ocr/product`, `/medications/add` 라우트 정상 컴파일.

- [ ] **Step 2: 수동 스모크 체크리스트 (dev 서버 `npm run dev`)**

`/medications/add?method=photo&tab=otc` 진입 후:
1. 일반약통(예: 타이레놀) 촬영 → **OTC 카드**에 공식명·**성분**·이미지 표시, "이 약이 맞아요" → AddForm이 해당 약 **선택완료** 상태로 열림 → 저장 시 약 지갑에 담김.
2. 인식 실패(흐릿) → 빈 검색 폼으로 착지(읽은 이름 프리필), **재시작 루프 없음**.
3. 진짜 약봉투/처방전 촬영 → "처방전으로 정확히 읽기" 핸드오프 카드 노출.
4. "1일 3회 식후 복용"만 있는 OTC 박스 → 핸드오프로 **안** 새고 OTC 카드로 감.

- [ ] **Step 3: 최종 커밋(스펙·플랜 포함, 이미 커밋됐으면 생략)**

```bash
git add docs/superpowers/
git commit -m "docs: OTC 통합 인식 설계·구현 계획" || true
```

---

## Self-Review

**1. Spec coverage:**
- 오분류 수정 → Task 1 ✓
- 성분 해결(로컬+허가정보) → Task 2 (`resolveProduct`) ✓
- 라우트 반환 구조화 → Task 2 ✓
- OTC 전용 간소 화면 → Task 3 ✓
- 정식 품목 `initialSelected` 저장(drug_id/item_seq) → Task 3 (`toSelected`) ✓
- 막다른 길 제거 → Task 3 (미해결 분기) ✓
- 처방전 경로 무변경 → 어떤 태스크도 `/api/ocr`·`ocr-uploader.tsx` 미수정 ✓
- 강한 처방전 신호일 때만 핸드오프 → Task 1 + Task 3 looksRx 분기 ✓

**2. Placeholder scan:** TODO/TBD 없음. 모든 코드 스텝에 실제 코드 포함.

**3. Type consistency:** `ResolvedProduct`(Task 2 정의)와 Task 3의 로컬 타입 필드 일치. `toSelected`가 반환하는 `Selected`는 add-form.tsx의 `Selected` union(drug 변형: id/item_seq/name/sub/source/imageUrl)과 일치. `/api/ocr/product` 반환 키(`products`/`candidates`/`isPrescription`)를 Task 3 `runRecognition`이 동일 키로 소비.
