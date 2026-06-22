import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logDurShadow } from '@/lib/dur-shadow'
import { logSupplementInteractionShadow } from '@/lib/supplement-interaction/shadow'
import { logger } from '@/lib/logger'
import { getActiveMember } from '@/lib/active-member'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { active } = await getActiveMember(supabase, user.id)

  const body = await request.json() as {
    medicines?: { name: string; edi_code?: string | null; ingredient?: string | null; dose_amount?: number | null; doses_per_day?: number | null; days?: number | null; meal_times?: string[] }[]
    names?: string[]
    prescription_id:  string | null
    pharmacy_name?:   string | null
    pharmacy_address?: string | null
    pharmacy_phone?:   string | null
    pharmacy_lat?:     number | null
    pharmacy_lng?:     number | null
  }
  const { prescription_id, pharmacy_name, pharmacy_address, pharmacy_phone, pharmacy_lat, pharmacy_lng } = body

  // 신규: 용법 포함 medicines[] / 구버전: names[] 모두 지원
  const items = Array.isArray(body.medicines) && body.medicines.length > 0
    ? body.medicines
    : (body.names ?? []).map(name => ({ name, edi_code: null, ingredient: null, dose_amount: null, doses_per_day: null, days: null, meal_times: [] as string[] }))

  if (items.length === 0) {
    return NextResponse.json({ error: '약품명 없음' }, { status: 400 })
  }

  const today = new Date().toISOString().split('T')[0]

  // drugs 매칭: EDI 보험코드 → edi_code 컬럼 ilike(콤마 다중코드 대응) → 이름 ilike 폴백
  const rows = await Promise.all(
    items.map(async (m) => {
      const ediCode = m.edi_code?.replace(/\D/g, '') || null
      let drugRow: { id: string } | null = null

      if (ediCode) {
        // 콤마 경계 매칭 — 9자리 코드가 더 긴 코드의 부분문자열로 오매칭되는 것 방지
        // (ediCode는 숫자만 — 콤마 포함 like 패턴은 PostgREST 규칙대로 큰따옴표로 감싼다)
        const { data } = await supabase.from('drugs').select('id')
          .or(`edi_code.eq.${ediCode},edi_code.like."${ediCode},%",edi_code.like."%,${ediCode}",edi_code.like."%,${ediCode},%"`)
          .eq('is_canceled', false)
          .limit(1).maybeSingle()
        drugRow = data
      }
      if (!drugRow) {
        // 이름 폴백: 정확 일치 우선 → 부분 일치
        const { data: exact } = await supabase.from('drugs').select('id')
          .eq('item_name', m.name)
          .eq('is_canceled', false)
          .limit(1).maybeSingle()
        drugRow = exact
      }
      if (!drugRow) {
        const { data } = await supabase.from('drugs').select('id')
          .ilike('item_name', `%${m.name}%`)
          .eq('is_canceled', false)
          .limit(1).maybeSingle()
        drugRow = data
      }
      const data = drugRow

      return {
        user_id:         user.id,
        member_id:       active.id,
        drug_id:         data?.id ?? null,
        supplement_id:   null,
        custom_name:     data ? null : m.name,
        ingredient:      m.ingredient    ?? null,
        dose_amount:     m.dose_amount   ?? null,
        doses_per_day:   m.doses_per_day ?? null,
        total_days:      m.days          ?? null,
        meal_times:      m.meal_times    ?? [],
        started_at:      today,
        source:          'ocr' as const,
        prescription_id: prescription_id ?? null,
      }
    })
  )

  const { error } = await supabase.from('user_medications').insert(rows)
  if (error) {
    logger.error('medications/bulk', 'insert 오류', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // DUR shadow: 저장된 실제 drug_id 기반 (fire-and-forget)
  const drugIds = rows.map(r => r.drug_id).filter((id): id is string => !!id)
  if (drugIds.length >= 2) {
    logDurShadow(user.id, drugIds, prescription_id ?? undefined)
  }

  // 건기식·약물 상호작용 shadow: 지갑 전체(약물×건기식) 기준 (fire-and-forget)
  logSupplementInteractionShadow(user.id, prescription_id ?? undefined)

  // 조제 약국 정보를 처방전에 반영
  if (prescription_id && pharmacy_name) {
    await supabase
      .from('user_prescriptions')
      .update({
        pharmacy_name,
        ...(pharmacy_address !== undefined && { pharmacy_address }),
        ...(pharmacy_phone   !== undefined && { pharmacy_phone   }),
        ...(pharmacy_lat     !== undefined && { pharmacy_lat     }),
        ...(pharmacy_lng     !== undefined && { pharmacy_lng     }),
      })
      .eq('id', prescription_id)
      .eq('user_id', user.id)
  }

  return NextResponse.json({ saved: rows.length })
}
