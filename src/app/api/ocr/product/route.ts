import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'

// 박스 사진 → 제품명 후보 추출 전용. 처방전 OCR(/api/ocr)과 달리 EDI·용법·표 파싱을
// 하지 않고 DB에도 저장하지 않는다. 반환한 이름으로 프론트가 /api/drugs/search 를 돌려
// 사용자가 정확한 품목을 고르게 한다(custom_name 회피 → DUR·상호작용 엔진 투입 가능).
export const maxDuration = 30
export const runtime = 'nodejs'

const BOX_PROMPT = `다음은 일반의약품 또는 건강기능식품 "제품 박스"를 OCR로 읽은 텍스트야. 여기서 사람이 검색할 만한 제품명(상품명) 후보를 가장 그럴듯한 순서로 1~3개 뽑아줘.

Return ONLY a JSON object: { "names": ["제품명1", "제품명2"] }
규칙:
- 상품명(브랜드+제품명)만. 예: "타이레놀정500밀리그람", "센트룸 우먼", "고려은단 비타민C".
- 제조사·판매사명 단독, 성분 나열, 함량/용량(mg·g·정·캡슐 수), 효능·효과 문구, "건강기능식품"·"일반의약품" 같은 분류어, 바코드/숫자열, 영양정보표는 제외.
- 한국 제품이면 한글 상품명을 우선. 영문 병기는 핵심 단어만.
- 가장 확실한 후보를 배열 첫 번째에 둘 것. 없으면 빈 배열.
- 정확히 이 JSON 형태만 반환. 다른 필드 금지.`

async function runClovaOcr(imageBytes: ArrayBuffer, mime: string, ext: string): Promise<string> {
  const url    = process.env.CLOVA_OCR_API_URL
  const secret = process.env.CLOVA_OCR_SECRET
  if (!url || !secret) throw new Error('CLOVA_OCR_API_URL / CLOVA_OCR_SECRET 미설정')

  const fd = new FormData()
  fd.append('message', JSON.stringify({
    version:   'V2',
    requestId: crypto.randomUUID(),
    timestamp: Date.now(),
    lang:      'ko',
    images:    [{ format: ext.replace(/^jpe?g$/i, 'jpg'), name: 'product' }],
  }))
  fd.append('file', new Blob([imageBytes], { type: mime }), `product.${ext}`)

  const res = await fetch(url, {
    method:  'POST',
    headers: { 'X-OCR-SECRET': secret },
    body:    fd,
    signal:  AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`CLOVA OCR HTTP ${res.status}`)

  const json = await res.json()
  const fields: { inferText: string; lineBreak?: boolean }[] = json.images?.[0]?.fields ?? []
  return fields
    .map(f => f.inferText + (f.lineBreak ? '\n' : ' '))
    .join('')
    .replace(/[ \t]+\n/g, '\n')
    .trim()
}

function isValidOpenAiKey(key: string | undefined): boolean {
  return typeof key === 'string' && key.startsWith('sk-') && key.length > 20
}

// GPT 미사용 폴백: 한글이 포함되고 단위/숫자 위주가 아닌 라인을 길이순으로 후보화.
const UNIT_RE = /(mg|밀리그람|밀리그램|그람|그램|\bg\b|ml|밀리리터|정|캡슐|캅셀|포|환|개입|일분|함량|성분|효능|효과|용법|제조|판매|유통기한|건강기능식품|일반의약품)/i
function pickNamesHeuristic(rawText: string): string[] {
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean)
  const cands = lines
    .filter(l => /[가-힣]/.test(l) && l.length >= 3 && l.length <= 24)
    .filter(l => !UNIT_RE.test(l))
    .filter(l => (l.replace(/\D/g, '').length / l.length) < 0.4) // 숫자 비중 높은 줄 제외
  return [...new Set(cands)].slice(0, 3)
}

async function extractNamesWithGpt(rawText: string): Promise<string[]> {
  const key = process.env.OPENAI_API_KEY
  if (!isValidOpenAiKey(key)) return pickNamesHeuristic(rawText)

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method:  'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model:           'gpt-4o-mini',
        messages: [
          { role: 'developer', content: BOX_PROMPT },
          { role: 'user',      content: rawText.slice(0, 4000) },
        ],
        max_tokens:      200,
        temperature:     0,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok) return pickNamesHeuristic(rawText)
    const json    = await res.json()
    const content = json.choices?.[0]?.message?.content ?? '{}'
    const parsed  = JSON.parse(content)
    const names   = Array.isArray(parsed.names) ? parsed.names : []
    const clean   = names
      .filter((n: unknown): n is string => typeof n === 'string')
      .map((n: string) => n.trim())
      .filter((n: string) => n.length >= 2 && n.length <= 40)
    return clean.length > 0 ? clean.slice(0, 3) : pickNamesHeuristic(rawText)
  } catch {
    return pickNamesHeuristic(rawText)
  }
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const formData = await request.formData()
  const file     = formData.get('image') as File | null
  if (!file) return NextResponse.json({ error: '이미지 없음' }, { status: 400 })

  const MAX_BYTES = 4 * 1024 * 1024
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'image_too_large', max_mb: 4 }, { status: 413 })

  const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: 'unsupported_type', allowed: [...ALLOWED_TYPES] }, { status: 415 })
  }

  const bytes = await file.arrayBuffer()
  const mime  = file.type || 'image/jpeg'
  const ext   = (file.name.split('.').pop() ?? 'jpg').toLowerCase()

  try {
    const rawText = await runClovaOcr(bytes, mime, ext)
    if (!rawText) return NextResponse.json({ names: [] })
    const names = await extractNamesWithGpt(rawText)
    return NextResponse.json({ names })
  } catch (e) {
    logger.error('OCR', '박스 인식 오류', e)
    return NextResponse.json({ names: [], error: 'ocr_failed' }, { status: 200 })
  }
}
