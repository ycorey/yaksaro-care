import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'
import { getActiveMember } from '@/lib/active-member'

// OCR(CLOVA)+GPT 파이프라인은 길어질 수 있어 60초 한도 + Node 런타임 명시
export const maxDuration = 60
export const runtime = 'nodejs'

// ── 파싱 프롬프트: 한국 약사 페르소나 + PII 무시 + 약품 용법 추출 ─────
const PARSE_PROMPT = `너는 대한민국의 전문 약사야. 주어진 처방전 텍스트에서 주민등록번호와 실명 정보는 무조건 무시하고, 약품 이름, 복용량(mg 등 단위 포함), 일일 복용 횟수, 총 처방 일수, 조제 약국 이름을 찾아내어 JSON 구조로 정제해줘.

Return ONLY a JSON object with exactly these fields:
{
  "medicines": [{ "name": "약품명", "ingredient": "주성분명" 또는 null, "edi_code": "9자리코드" 또는 null, "dose_amount": 숫자 또는 null, "doses_per_day": 숫자 또는 null, "days": 숫자 또는 null }],
  "pharmacy_name": "약국명" 또는 null,
  "hospital_name": "발급 병원명" 또는 null,
  "institution_code": "요양기관기호 8자리" 또는 null,
  "department": "진료과" 또는 null
}
- hospital_name: 처방전을 발급한 병원/의원명 (예: 세브란스병원).
- institution_code: "요양기관기호" 뒤 8자리 숫자.
- department: 진료과/진료과목 (예: 내과, 정형외과, 이비인후과). null if not found.
- name: 상품명+제형+함량(용량)까지 포함 (예: "타이레놀정500밀리그람", "아모잘탄정5/50밀리그람"). 괄호 안 성분명은 제외.
- ingredient: 괄호 안 주성분명 (예: 록소프로펜나트륨). null if not found.
- edi_code: 약품명 앞 대괄호 안 9자리 보험코드 (예: [671701890] → "671701890"). null if not found.
- dose_amount: 1회 투약량 (정/포/캡슐 등 개수, '1회투약량' 칸). 상품명 옆 mg/g 함량(예: 50mg, 2g)은 함량이지 투약량이 아니므로 쓰지 말 것. 보통 0.5~10. null if not found.
- doses_per_day: 1일 투여 횟수 ('1일투여횟수' 칸). 거의 항상 1~4. 5 이상이면 일수를 잘못 본 것일 수 있으니 의심할 것. null if not found.
- days: 총 투약 일수 ('총투약일수' 칸). 보통 1~90이며 세 숫자 중 가장 큰 값인 경우가 많다. null if not found.
- 각 약품 행에는 보통 [1회투약량, 1일투여횟수, 총투약일수] 순서로 숫자 3개가 같은 줄(또는 그 약품 바로 다음 줄들)에 나온다. 이 열 순서를 반드시 지켜 매칭할 것. 약품마다 자기 행의 숫자만 쓰고 다른 약 행의 숫자와 섞지 말 것.
- 9자리 보험(EDI)코드·금액(원)·본인부담금·단가·약품일련번호는 절대 dose/횟수/일수로 쓰지 말 것.
- "사용기간 교부일부터 (N)" 의 N은 무시할 것 (days 아님).
- pharmacy_name: 조제 약국명. null if not found.
- Return exactly this JSON shape, no extra fields.`

type ParsedMedicine = {
  name:          string
  ingredient:    string | null   // 주성분명 (괄호 안)
  edi_code:      string | null   // 보험 EDI 코드 (9자리) — 약물 정확 식별용
  dose_amount:   number | null   // 1회 투약량
  doses_per_day: number | null   // 1일 투여횟수
  days:          number | null   // 총 투약일수
}

type ParsedPrescription = {
  medicines:        ParsedMedicine[]
  pharmacy_name:    string | null
  hospital_name:    string | null   // 발급 병원명
  institution_code: string | null   // 요양기관기호 (8자리)
  department:       string | null   // 진료과
}

// CLOVA OCR 필드 타입 (V2는 줄 끝에 lineBreak=true 제공 → 행 구조 복원에 사용)
type ClovaField = { inferText: string; inferConfidence: number; lineBreak?: boolean }

async function runClovaOcr(imageBytes: ArrayBuffer, mime: string, ext: string): Promise<string> {
  const url    = process.env.CLOVA_OCR_API_URL
  const secret = process.env.CLOVA_OCR_SECRET
  if (!url || !secret) throw new Error('CLOVA_OCR_API_URL / CLOVA_OCR_SECRET 미설정')

  const fd = new FormData()
  fd.append('message', JSON.stringify({
    version:           'V2',
    requestId:         crypto.randomUUID(),
    timestamp:         Date.now(),
    lang:              'ko',
    images: [{ format: ext.replace(/^jpe?g$/i, 'jpg'), name: 'prescription' }],
    enableTableDetect: false,
  }))
  fd.append('file', new Blob([imageBytes], { type: mime }), `prescription.${ext}`)

  const res = await fetch(url, {
    method:  'POST',
    headers: { 'X-OCR-SECRET': secret },
    body:    fd,
    signal:  AbortSignal.timeout(30_000),  // 30초 — 무한 대기 방지
  })
  if (!res.ok) throw new Error(`CLOVA OCR HTTP ${res.status}`)

  const json   = await res.json()
  const fields: ClovaField[] = json.images?.[0]?.fields ?? []
  // 줄바꿈(lineBreak) 보존 → 처방전 표의 행 구조를 유지해야 1회량/1일횟수/총일수
  // 숫자가 어느 약·어느 칸인지 정확히 매칭된다. (전부 공백으로 이으면 표 구조가 뭉개짐)
  return fields
    .map(f => f.inferText + (f.lineBreak ? '\n' : ' '))
    .join('')
    .replace(/[ \t]+\n/g, '\n')
    .trim()
}

function isValidOpenAiKey(key: string | undefined): boolean {
  return typeof key === 'string' && key.startsWith('sk-') && key.length > 20
}

// 용법 숫자 상식 범위 검증 — 범위 밖(9자리 코드·금액 등 오인)은 null로 두어
// "틀린 값"보다 "빈칸(사용자 수정)"이 되게 한다.
function saneNum(v: unknown, lo: number, hi: number): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null
}

// ── 정규식 파서 (GPT 미사용 폴백) ─────────────────────────────────────
const DRUG_FORMS = '정|캡슐|캅셀|액|시럽|연고|크림|산|과립|주사|패치|흡입제|겔|로션|좌제|점안제|점이제|점비액|에멀젼|틴크|환'

// CLOVA 약품명 토큰 정리: 괄호/성분/규격 제거 후 제형으로 끝나도록 자름
function cleanDrugName(raw: string): string | null {
  // 첫 괄호 "(" 또는 "_(" 이전까지가 제품명
  let name = raw.split(/[(_]/)[0].trim()
  // 제형 suffix가 있으면 그 지점까지만 사용 (뒤 잡음 제거)
  const m = name.match(new RegExp(`^(.*?(?:${DRUG_FORMS}))`))
  if (m) name = m[1]
  name = name.replace(/\s+/g, '').trim()
  if (name.length < 3 || !/[가-힣]/.test(name)) return null
  return name
}

// 허가 품목명(EDI 역조회로 받은 공식명) 표시용 정리: 괄호 안 성분명만 제거하고
// 함량/규격(예: 500밀리그람, 60mg)은 **보존**한다. cleanDrugName은 제형(정/캡슐)에서
// 잘라 함량을 버리므로 권위 있는 공식명에는 쓰지 않는다.
// (자동완성은 item_name을 그대로 보여줘 함량이 보이는데, OCR만 함량이 사라지던 문제 교정)
function officialDisplayName(itemName: string): string | null {
  const name = itemName.split(/[(_]/)[0].replace(/\s+/g, ' ').trim()
  return name.length >= 2 && /[가-힣A-Za-z]/.test(name) ? name : null
}

// 괄호 안 성분명 추출: "...정(록소프로펜나트륨" → "록소프로펜나트륨"
function extractIngredient(raw: string): string | null {
  const m = raw.match(/\(([^)_]+)/)
  if (!m) return null
  const ing = m[1].replace(/\s+/g, '').trim()
  return ing.length >= 2 && /[가-힣]/.test(ing) ? ing : null
}

function parseWithRegex(rawText: string): ParsedPrescription {
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean)

  // ── 약국명 ──
  let pharmacy_name: string | null = null
  for (const line of lines) {
    const m = line.match(/([가-힣A-Za-z0-9]{2,}약국)/)
    if (m) { pharmacy_name = m[1]; break }
  }

  // ── 약품명 + 용법 ──
  const medicines: ParsedMedicine[] = []
  const seen   = new Set<string>()
  const codeRe = /^\[?\d{8,9}\]?$/
  const numRe  = /^\d+$/

  // 1순위: [보험코드] → 다음 줄 약품명 → 이어지는 숫자 [1회량, 1일횟수, 총일수]
  for (let i = 0; i < lines.length - 1; i++) {
    if (!codeRe.test(lines[i])) continue
    const name = cleanDrugName(lines[i + 1])
    if (!name || seen.has(name)) continue
    const ingredient = extractIngredient(lines[i + 1])
    const edi_code   = lines[i].replace(/\D/g, '') || null  // [671701890] → 671701890

    const nums: number[] = []
    for (let j = i + 2; j < lines.length && nums.length < 3 && numRe.test(lines[j]); j++) {
      nums.push(parseInt(lines[j], 10))
    }
    seen.add(name)
    medicines.push({
      name,
      ingredient,
      edi_code,
      dose_amount:   nums[0] ?? null,  // 1회 투약량
      doses_per_day: nums[1] ?? null,  // 1일 투여횟수
      days:          nums[2] ?? null,  // 총 투약일수
    })
  }

  // 2순위(코드 없는 처방전): 제형으로 끝나는 토큰만 (용법 미상)
  if (medicines.length === 0) {
    const inlineRe = new RegExp(`([가-힣A-Za-z0-9][가-힣A-Za-z0-9·]*(?:${DRUG_FORMS}))`)
    const SKIP = ['투약', '처방', '일수', '횟수', '급여', '환자', '의료', '질병', '주사제', '조제', '사용기간']
    for (const line of lines) {
      if (SKIP.some(w => line.includes(w))) continue
      const m    = line.match(inlineRe)
      const name = m ? cleanDrugName(m[1]) : null
      if (name && !seen.has(name)) {
        seen.add(name)
        medicines.push({ name, ingredient: null, edi_code: null, dose_amount: null, doses_per_day: null, days: null })
      }
    }
  }

  return { medicines, pharmacy_name, ...extractHospital(rawText) }
}

async function parseWithGpt(rawText: string): Promise<ParsedPrescription> {
  const key = process.env.OPENAI_API_KEY
  if (!isValidOpenAiKey(key)) return parseWithRegex(rawText)

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method:  'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model:           'gpt-4o-mini',
      messages: [
        { role: 'developer', content: PARSE_PROMPT },
        { role: 'user',      content: rawText },
      ],
      max_tokens:      600,
      temperature:     0,
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(25_000),  // 25초 — 응답 지연 시 정규식 폴백
  })
  if (!res.ok) return parseWithRegex(rawText)

  const json    = await res.json()
  const content = json.choices?.[0]?.message?.content ?? '{}'
  const parsed  = JSON.parse(content)
  const raw     = Array.isArray(parsed.medicines) ? parsed.medicines : []

  return {
    medicines: raw
      .filter((m: { name?: unknown }) => m && typeof m.name === 'string')
      .map((m: { name: string; ingredient?: unknown; edi_code?: unknown; dose_amount?: unknown; doses_per_day?: unknown; days?: unknown }) => ({
        name:          m.name,
        ingredient:    typeof m.ingredient === 'string' ? m.ingredient : null,
        edi_code:      typeof m.edi_code === 'string' ? m.edi_code.replace(/\D/g, '') || null : null,
        dose_amount:   saneNum(m.dose_amount, 0.25, 30),
        doses_per_day: saneNum(m.doses_per_day, 1, 6),
        days:          saneNum(m.days, 1, 365),
      })),
    pharmacy_name:    typeof parsed.pharmacy_name === 'string' ? parsed.pharmacy_name : null,
    hospital_name:    typeof parsed.hospital_name === 'string' && parsed.hospital_name ? parsed.hospital_name : extractHospital(rawText).hospital_name,
    institution_code: typeof parsed.institution_code === 'string' && /^\d{8}$/.test(parsed.institution_code) ? parsed.institution_code : extractHospital(rawText).institution_code,
    department:       typeof parsed.department === 'string' && parsed.department ? parsed.department : extractHospital(rawText).department,
  }
}

// ── 코드 전용 인식: 9자리 EDI 코드만 찍은 경우 허가정보로 약품명 역조회 ──
async function fetchLicenseNameByEdi(edi: string): Promise<{ ITEM_NAME?: string } | null> {
  const key = process.env.MFDS_DRUG_LICENSE_KEY
  if (!key) return null
  const url = 'https://apis.data.go.kr/1471000/DrugPrdtPrmsnInfoService07/getDrugPrdtPrmsnInq07'
    + `?serviceKey=${encodeURIComponent(key)}&edi_code=${encodeURIComponent(edi)}&numOfRows=1&pageNo=1&type=json`
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const json  = await res.json()
    const items = json?.body?.items
    return Array.isArray(items) ? (items[0] ?? null) : (items ?? null)
  } catch {
    return null
  }
}

// GPT가 뽑은 약품의 신원을 EDI 코드로 교정 — GPT는 용법(표 구조)에 강하고,
// 약품명은 EDI→허가정보가 권위있다. 둘을 결합해 정확도를 최대화한다.
async function correctIdentityByEdi(meds: ParsedMedicine[]): Promise<ParsedMedicine[]> {
  return Promise.all(meds.map(async (m) => {
    if (!m.edi_code) return m
    const lic = await fetchLicenseNameByEdi(m.edi_code)
    const itemName = lic?.ITEM_NAME
    if (!itemName) return m
    const name = officialDisplayName(itemName) // 함량 보존(공식 품목명)
    if (!name) return m
    return { ...m, name, ingredient: extractIngredient(itemName) ?? m.ingredient }
  }))
}

function extractPharmacyName(rawText: string): string | null {
  for (const line of rawText.split('\n')) {
    const m = line.match(/([가-힣A-Za-z0-9]{2,}약국)/)
    if (m) return m[1]
  }
  return null
}

// 발급 병원명 + 요양기관기호 추출 (정규식 경로/폴백용)
function extractHospital(rawText: string): { hospital_name: string | null; institution_code: string | null; department: string | null } {
  let hospital_name: string | null = null
  for (const line of rawText.split('\n').map(l => l.trim())) {
    const m = line.match(/([가-힣A-Za-z0-9·]+(?:병원|의원|한의원|보건소|의료원|클리닉))/)
    if (m && m[1].length >= 3) { hospital_name = m[1]; break }
  }
  const joined = rawText.replace(/\s+/g, ' ')
  const codeM  = joined.match(/요양기관기호[^\d]{0,5}(\d{8})/)
  // 진료과: "진료과목 ○○과" 라벨 우선, 없으면 알려진 과명(구체적 과 먼저) 탐지
  const deptLabeled = joined.match(/진료\s*과목?[^가-힣]{0,4}([가-힣]{2,7}과)/)
  const deptKnown   = joined.match(/(정형외과|신경외과|성형외과|흉부외과|이비인후과|소아청소년과|정신건강의학과|가정의학과|재활의학과|영상의학과|산부인과|비뇨의학과|비뇨기과|순환기내과|소화기내과|호흡기내과|내분비내과|신경과|피부과|안과|치과|한방내과|내과|외과)/)
  const department = deptLabeled ? deptLabeled[1] : (deptKnown ? deptKnown[1] : null)
  return { hospital_name, institution_code: codeM ? codeM[1] : null, department }
}

// 숫자 기반 추출(주 경로): 9자리 EDI 코드로 약품을 식별하고, 코드 뒤에 오는 숫자
// [1회투약량, 1일투여횟수, 총투약일수]를 용법으로 읽는다. 약품명은 허가정보에서 권위 조회.
// 한글 OCR에 의존하지 않아 인식 정확도가 높다.
async function parseByCodes(rawText: string): Promise<ParsedMedicine[]> {
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean)

  // 코드 위치 수집 (줄 내부 공백은 제거하고 9자리 판정 — "652 500251"도 인식)
  const positions: { code: string; idx: number }[] = []
  lines.forEach((l, i) => {
    const digits = l.replace(/\D/g, '')
    if (/^\d{9}$/.test(digits)) positions.push({ code: digits, idx: i })
  })
  if (positions.length === 0) return []

  const resolved = await Promise.all(positions.map(async (pos, k) => {
    const end = k + 1 < positions.length ? positions[k + 1].idx : lines.length
    // 코드와 다음 코드 사이에서 "단위 없는 순수 숫자(1~3자리)"만 용법 후보로 수집.
    // 단위 붙은 함량(2g/50mg/2Pack)·목록표시(1./2.)는 제외 — 병원마다 레이아웃이 달라 오인 방지.
    const nums: number[] = []
    for (let j = pos.idx + 1; j < end && nums.length < 3; j++) {
      if (/^\d{1,3}$/.test(lines[j])) nums.push(parseInt(lines[j], 10))
    }
    // 상식 범위 밖이면 신뢰 불가 → null (사용자가 수정). 잘못된 용법 노출 방지.
    const inRange = (v: number | undefined, lo: number, hi: number) =>
      (v != null && v >= lo && v <= hi) ? v : null

    const lic = await fetchLicenseNameByEdi(pos.code)
    const itemName = lic?.ITEM_NAME
    if (!itemName) return null
    const name = officialDisplayName(itemName) // 함량 보존(공식 품목명)
    if (!name) return null

    return {
      name,
      ingredient:    extractIngredient(itemName),
      edi_code:      pos.code,
      dose_amount:   inRange(nums[0], 1, 20),    // 1회 투약량
      doses_per_day: inRange(nums[1], 1, 6),     // 1일 투여횟수
      days:          inRange(nums[2], 1, 365),   // 총 투약일수
    } as ParsedMedicine
  }))

  const seen = new Set<string>()
  return resolved.filter((m): m is ParsedMedicine => !!m && !seen.has(m.edi_code!) && !!seen.add(m.edi_code!))
}

// ── 라우트 핸들러 ─────────────────────────────────────────────────────
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { active } = await getActiveMember(supabase, user.id)

  const formData = await request.formData()
  const file     = formData.get('image') as File | null
  if (!file) return NextResponse.json({ error: '이미지 없음' }, { status: 400 })

  // Payload 4MB 초과 시 413 — 프론트가 Canvas 압축 후 재시도하도록 표준 응답
  const MAX_BYTES = 4 * 1024 * 1024
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'image_too_large', max_mb: 4 }, { status: 413 })
  }

  // 이미지 타입만 허용 — CLOVA OCR 쿼터 낭비/비이미지 업로드 차단
  const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: 'unsupported_type', allowed: [...ALLOWED_TYPES] }, { status: 415 })
  }

  const bytes = await file.arrayBuffer()
  const mime  = file.type || 'image/jpeg'
  const ext   = (file.name.split('.').pop() ?? 'jpg').toLowerCase()

  // CLOVA OCR → 원문 텍스트 (bytes를 직접 전달 — Storage 경유 불필요)
  let rawText = ''
  let parsed: ParsedPrescription = { medicines: [], pharmacy_name: null, hospital_name: null, institution_code: null, department: null }

  try {
    rawText = await runClovaOcr(bytes, mime, ext)
    const hasGpt = isValidOpenAiKey(process.env.OPENAI_API_KEY)

    // 1순위(키 있을 때): GPT로 용법·구조 파싱 → 약품 신원은 EDI 코드로 교정 (하이브리드)
    if (hasGpt) {
      const g = await parseWithGpt(rawText)
      if (g.medicines.length > 0) {
        parsed = { ...g, medicines: await correctIdentityByEdi(g.medicines) }
      }
    }

    // 2순위(키 없거나 GPT 0건): 코드 기반 식별 (숫자만, 한글 의존 없음)
    if (parsed.medicines.length === 0) {
      const byCode = await parseByCodes(rawText)
      if (byCode.length > 0) {
        parsed = { medicines: byCode, pharmacy_name: extractPharmacyName(rawText), ...extractHospital(rawText) }
      } else if (!hasGpt) {
        // 3순위: 코드도 없으면 정규식 텍스트 파싱
        parsed = await parseWithGpt(rawText)
      }
    }
  } catch (e) {
    logger.error('OCR', '처리 오류', e)
  }

  const names   = parsed.medicines.map(m => m.name)
  const maxDays = parsed.medicines.reduce((mx, m) => (m.days && m.days > mx ? m.days : mx), 0) || null

  // 4. user_prescriptions에 저장 — 본인 행 insert이므로 user 토큰 + RLS로 충분.
  // 0건 추출(하드실패 포함)이면 행을 만들지 않는다 — UI가 재촬영만 안내하므로 orphan 처방행 방지.
  let prescriptionId: string | null = null
  if (parsed.medicines.length > 0) {
    const { data: prescription } = await supabase
      .from('user_prescriptions')
      .insert({
        user_id:           user.id,
        member_id:         active.id,
        raw_medicine_list: names,
        duration_days:     maxDays,
        pharmacy_name:     parsed.pharmacy_name,
        hospital_name:     parsed.hospital_name,
        institution_code:  parsed.institution_code,
        department:        parsed.department,
        prescribed_at:     new Date().toISOString().split('T')[0],
      })
      .select('id')
      .single()
    prescriptionId = prescription?.id ?? null
  }

  return NextResponse.json({
    prescription_id: prescriptionId,
    medicines:       parsed.medicines,
    pharmacy_name:   parsed.pharmacy_name,
  })
}
