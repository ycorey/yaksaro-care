import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// 약국 비공개 환자 메모 upsert/삭제. 약사 토큰 + RLS(자기 약국 + 동의 환자). pharmacy_id는 서버에서 강제.
export async function PUT(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { patientId, note } = await request.json().catch(() => ({})) as { patientId?: string; note?: string }
  if (!patientId) return NextResponse.json({ error: 'patientId 필요' }, { status: 400 })
  const text = (note ?? '').toString().trim().slice(0, 500)

  const { data: pharmacy } = await supabase
    .from('pharmacies').select('id').eq('owner_id', user.id).maybeSingle()
  if (!pharmacy) return NextResponse.json({ error: '약국 계정이 아닙니다' }, { status: 403 })

  // 빈 메모 → 삭제(메모 비우기)
  if (!text) {
    const { error } = await supabase
      .from('pharmacy_patient_notes')
      .delete()
      .eq('pharmacy_id', pharmacy.id)
      .eq('patient_id', patientId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  const { error } = await supabase
    .from('pharmacy_patient_notes')
    .upsert(
      { pharmacy_id: pharmacy.id, patient_id: patientId, note: text, updated_at: new Date().toISOString() },
      { onConflict: 'pharmacy_id,patient_id' },
    )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
