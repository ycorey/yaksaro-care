import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// 낱알식별 검색 — 모양·색(최대 2)·각인·분할선으로 drug_identification(067)을 조회한다.
// 쿼터(consumeQuota) 미사용: 외부 API 호출이 없는 순수 로컬 DB 조회라 보호할 외부 한도가 없다.
// drugs 와의 결합은 FK 임베드가 아니라 2단계 조회 — 낱알 데이터에는 우리 마스터에 없는
// item_seq 가 존재할 수 있어 FK 를 걸면 ETL 적재가 깨진다(가용성 우선, 065 와 같은 판단).

const LIMIT = 20
const CAND_ROWS = 80  // 마스터 미존재·취소 품목 탈락분을 감안한 여유 후보

// 각인 비교 정규화 — 대소문자·공백 차이를 무시한다
const normPrint = (s: string) => s.toUpperCase().replace(/\s+/g, '')

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const shape  = searchParams.get('shape')?.trim() || null
  const color1 = searchParams.get('color1')?.trim() || null
  const color2 = searchParams.get('color2')?.trim() || null
  const print  = searchParams.get('print')?.trim() || null
  const line   = searchParams.get('line')?.trim() || null

  // 전체 덤프 방지 — 최소 한 가지 조건은 있어야 한다
  if (!shape && !color1 && !print) {
    return NextResponse.json({ error: '모양·색·각인 중 하나는 선택해 주세요' }, { status: 400 })
  }

  let q = supabase
    .from('drug_identification')
    .select('item_seq, print_front, print_back, drug_shape, color_class1, color_class2, form_code_name, image_url')
    .limit(CAND_ROWS)

  if (shape) q = q.eq('drug_shape', shape)
  // 색은 앞(color_class1)/뒤(color_class2) 어느 쪽이든, 복합색("하양, 노랑")은 포함으로 매칭
  for (const c of [color1, color2].filter((v): v is string => !!v)) {
    q = q.or(`color_class1.ilike.%${c}%,color_class2.ilike.%${c}%`)
  }
  if (line) q = q.or(`line_front.eq.${line},line_back.eq.${line}`)
  if (print) {
    // DB 프리필터: 사용자 입력의 공백을 제거하고 ilike(대소문자 무시) — 'yksr aa' 가 'YKSRAA' 에 닿는다.
    // 한계: 저장값 쪽에 공백이 있는 각인('TY LENOL')은 프리필터가 놓친다 — ETL 실데이터에서
    // 공백 포함 각인이 유의미하게 나오면 정규화 컬럼을 추가할 것(지금은 마크성 각인이 대다수 전제).
    const safe = print.replace(/[\s%_,()]/g, '')  // 공백 + PostgREST or() 구문·LIKE 와일드카드 제거
    if (safe) q = q.or(`print_front.ilike.%${safe}%,print_back.ilike.%${safe}%`)
  }

  const { data: idents, error } = await q
  if (error) return NextResponse.json({ error: '검색 실패' }, { status: 500 })

  // 각인 정규화 재판정 — "TY LENOL" 같은 공백 차이를 흡수
  const wanted = print ? normPrint(print) : null
  const matched = (idents ?? []).filter(r =>
    !wanted || normPrint(`${r.print_front ?? ''}${r.print_back ?? ''}`).includes(wanted),
  )

  if (matched.length === 0) return NextResponse.json({ items: [], more: false })

  // 마스터 결합 — 등록 계약(drug_id)에 합류할 수 있는 정상 품목만 노출
  const { data: drugs } = await supabase
    .from('drugs')
    .select('id, item_seq, item_name, entp_name')
    .in('item_seq', matched.map(r => r.item_seq))
    .eq('is_canceled', false)
  const bySeq = new Map((drugs ?? []).map(d => [d.item_seq, d]))

  const joined = matched
    .filter(r => bySeq.has(r.item_seq))
    .map(r => {
      const d = bySeq.get(r.item_seq)!
      return {
        drugId:   d.id,
        itemSeq:  r.item_seq,
        itemName: d.item_name,
        entpName: d.entp_name,
        imageUrl: r.image_url,
        shape:    r.drug_shape,
        colors:   [r.color_class1, r.color_class2].filter(Boolean).join(' · ') || null,
        print:    [r.print_front, r.print_back].filter(Boolean).join(' / ') || null,
        formName: r.form_code_name,
      }
    })

  return NextResponse.json({
    items: joined.slice(0, LIMIT),
    more:  joined.length > LIMIT,
  })
}
