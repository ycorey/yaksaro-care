import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendPushToUser } from '@/lib/push'
import { getActiveMember } from '@/lib/active-member'
import { todayKST } from '@/lib/request-schedule'

// 단골약국(B2B) 비임상 요청. 사용자 토큰+RLS. pharmacy_id는 서버에서 본인 단골약국으로 강제.
const TYPES = ['callback', 'dispense_prep', 'pickup', 'consult_booking', 'stock_inquiry'] as const

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { data } = await supabase
    .from('pharmacy_requests')
    .select('id, type, note, status, created_at, responded_at, reply_text, replied_at, patient_ack_at')
    .eq('patient_id', user.id)
    .order('created_at', { ascending: false })
    .limit(20)

  return NextResponse.json({ requests: data ?? [] })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const body = await request.json().catch(() => ({})) as { type?: string; note?: string; contact_phone?: string }
  if (!body.type || !TYPES.includes(body.type as typeof TYPES[number])) {
    return NextResponse.json({ error: '요청 유형이 올바르지 않아요' }, { status: 400 })
  }

  // 단골약국(QR/B2B) 확인 — 텍스트 등록만 있으면 받을 약사가 없음
  const { data: profile } = await supabase
    .from('profiles').select('regular_pharmacy_id').eq('id', user.id).single()
  if (!profile?.regular_pharmacy_id) {
    return NextResponse.json({ error: 'QR로 연결된 단골약국이 없어요' }, { status: 400 })
  }

  // 요청 폭주 방지 — (patient, pharmacy)당 미처리 요청 10건 이상이면 거부
  const { count } = await supabase
    .from('pharmacy_requests')
    .select('id', { count: 'exact', head: true })
    .eq('patient_id', user.id)
    .eq('pharmacy_id', profile.regular_pharmacy_id)
    .in('status', ['open', 'acknowledged'])
  if ((count ?? 0) >= 10) {
    return NextResponse.json(
      { error: '처리 대기 중인 요청이 많아요. 잠시 후 다시 시도해주세요' },
      { status: 400 },
    )
  }

  // 활성 멤버 기록 — 가족 요청이면 member_id 세팅(약사 요청함에 '가족'으로 표기). 본인이면 null.
  const { active } = await getActiveMember(supabase, user.id)
  const memberId = active.is_self ? null : active.id

  const { data, error } = await supabase
    .from('pharmacy_requests')
    .insert({
      patient_id:    user.id,
      pharmacy_id:   profile.regular_pharmacy_id,
      member_id:     memberId,
      type:          body.type,
      note:          (body.note ?? '').toString().trim().slice(0, 300) || null,
      contact_phone: (body.contact_phone ?? '').toString().trim().slice(0, 30) || null,
      due_date:      todayKST(),   // 기본 마감 = 접수일(당일), 약사가 조정
    })
    .select('id, type, note, status, created_at')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 약국 owner(약사)에게 새 요청 푸시 — PII/임상정보 없이 알림만 (fire-and-forget)
  void (async () => {
    try {
      const admin = createAdminClient()
      const { data: ph } = await admin.from('pharmacies').select('owner_id').eq('id', profile.regular_pharmacy_id!).single()
      if (ph?.owner_id) {
        await sendPushToUser(ph.owner_id as string, {
          title: '새 환자 요청', body: '단골 환자가 요청을 보냈어요.', url: '/pharmacy',
        })
      }
    } catch { /* 알림 실패는 무시 */ }
  })()

  return NextResponse.json({ request: data })
}

// 환자 응답 — ack('확인했어요' 1탭) 또는 cancel(취소). 자유 입력 없음(채팅화 방지).
export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { id, action } = await request.json().catch(() => ({})) as { id?: string; action?: 'ack' | 'cancel' }
  if (!id) return NextResponse.json({ error: 'id 필요' }, { status: 400 })

  if (action === 'ack') {
    // 약사 회신(replied_at 존재)을 환자가 확인 — patient_ack_at만 기록
    const { error } = await supabase
      .from('pharmacy_requests')
      .update({ patient_ack_at: new Date().toISOString() })
      .eq('id', id).eq('patient_id', user.id).not('replied_at', 'is', null)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // 취소(기본·하위호환) — open/acknowledged 본인 요청
  const { error } = await supabase
    .from('pharmacy_requests')
    .update({ status: 'canceled' })
    .eq('id', id).eq('patient_id', user.id).in('status', ['open', 'acknowledged'])
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
