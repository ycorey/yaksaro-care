import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logDurShadow } from '@/lib/dur-shadow'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const body = await request.json() as {
    medicines?: { name: string; edi_code?: string | null; ingredient?: string | null; dose_amount?: number | null; doses_per_day?: number | null; days?: number | null }[]
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
    : (body.names ?? []).map(name => ({ name, edi_code: null, ingredient: null, dose_amount: null, doses_per_day: null, days: null }))

  if (items.length === 0) {
    return NextResponse.json({ error: '약품명 없음' }, { status: 400 })
  }

  const today = new Date().toISOString().split('T')[0]

  // drugs 매칭: EDI 코드(품목기준코드)가 있으면 item_seq 정확 조회, 없으면 이름 ilike 폴백
  const rows = await Promise.all(
    items.map(async (m) => {
      const ediCode = m.edi_code?.replace(/\D/g, '') || null
      const { data } = ediCode
        ? await supabase.from('drugs').select('id').eq('item_seq', ediCode).maybeSingle()
        : await supabase.from('drugs').select('id').ilike('item_name', `%${m.name}%`).limit(1).maybeSingle()

      return {
        user_id:         user.id,
        drug_id:         data?.id ?? null,
        supplement_id:   null,
        custom_name:     data ? null : m.name,
        ingredient:      m.ingredient    ?? null,
        dose_amount:     m.dose_amount   ?? null,
        doses_per_day:   m.doses_per_day ?? null,
        total_days:      m.days          ?? null,
        started_at:      today,
        source:          'ocr' as const,
        prescription_id: prescription_id ?? null,
      }
    })
  )

  const { error } = await supabase.from('user_medications').insert(rows)
  if (error) {
    console.error('bulk insert 오류:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // DUR shadow: 저장된 실제 drug_id 기반 (fire-and-forget)
  const drugIds = rows.map(r => r.drug_id).filter((id): id is string => !!id)
  if (drugIds.length >= 2) {
    logDurShadow(user.id, drugIds, prescription_id ?? undefined)
  }

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
