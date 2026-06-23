import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendPushToUser } from '@/lib/push'

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

  // RLS(preq_pharmacist_update)가 자기 약국 요청만 허용. 환자 푸시용 patient_id 회수.
  const { data, error } = await supabase
    .from('pharmacy_requests')
    .update({ status, responded_at: new Date().toISOString() })
    .eq('id', id)
    .select('patient_id, type')
    .single()
  if (error || !data) return NextResponse.json({ error: error?.message ?? '대상 없음' }, { status: 500 })

  // 환자에게 상태 푸시 (fire-and-forget — 약국→환자 소식)
  const label = TYPE_LABEL[data.type as string] ?? '요청'
  void sendPushToUser(data.patient_id as string, {
    title: '단골약국 소식',
    body: status === 'done' ? `${label}이(가) 완료됐어요` : `${label}을(를) 약국이 확인했어요`,
    url: '/settings',
  }).catch(() => {})

  return NextResponse.json({ ok: true })
}
