import { NextResponse, after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendPushToUser } from '@/lib/push'
import { ownedPharmacyId } from '@/lib/pharmacy-auth'
import { dbError } from '@/lib/api-error'

// 약사가 요청 상태 변경(확인/완료) → 환자에게 상태 푸시. 사용자(약사) 토큰+RLS(자기 약국만).
const TYPE_LABEL: Record<string, string> = {
  callback: '전화 요청', dispense_prep: '조제 준비', pickup: '픽업 예약',
  consult_booking: '상담 예약', stock_inquiry: '재고 문의',
}

export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { id, status } = await request.json().catch(() => ({})) as { id?: string; status?: string }
  if (!id || (status !== 'acknowledged' && status !== 'done')) {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 })
  }

  // 약국 계정인지 앱 계층에서 먼저 확인 — RLS 만 믿으면 환자가 자기 요청에 대해 통과한다.
  const pharmacyId = await ownedPharmacyId(supabase, user.id)
  if (!pharmacyId) return NextResponse.json({ error: '약국 계정이 아닙니다' }, { status: 403 })

  // RLS(preq_pharmacist_update) + pharmacy_id 명시로 이중 방어. 환자 푸시용 patient_id 회수.
  const { data, error } = await supabase
    .from('pharmacy_requests')
    .update({ status, responded_at: new Date().toISOString() })
    .eq('id', id)
    .eq('pharmacy_id', pharmacyId)
    .select('patient_id, type')
    .single()
  if (error || !data) return dbError('pharmacy', error, '요청을 찾을 수 없어요', 404)

  // 환자에게 상태 푸시 (약국→환자 소식) — 응답은 막지 않되 완료는 보장(after).
  // `void` 로 띄우면 응답 후 인스턴스 회수 시 조용히 사라진다(api/meal-checks 와 같은 계열).
  const label = TYPE_LABEL[data.type as string] ?? '요청'
  after(() => sendPushToUser(data.patient_id as string, {
    title: '단골약국 소식',
    body: status === 'done' ? `${label}이(가) 완료됐어요` : `${label}을(를) 약국이 확인했어요`,
    url: '/medications/pharmacy-request',   // 회신 내용이 있는 화면으로 직행(설정 하단까지 찾아 들어가지 않게)
  }).catch(() => {}))

  return NextResponse.json({ ok: true })
}
