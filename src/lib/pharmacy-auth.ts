import type { createClient } from '@/lib/supabase/server'

type ServerClient = Awaited<ReturnType<typeof createClient>>

// 약사 라우트의 소유권 확인 SSOT.
//
// 약사 전용 엔드포인트가 `.eq('id', id)` 만 걸고 "RLS 가 자기 약국으로 좁혀준다"에 의존하면,
// 타 약국 누수는 없더라도 **환자 본인**이 그 엔드포인트를 호출했을 때 자기 행에 대해 통과한다.
// (환자에게도 pharmacy_requests UPDATE 정책이 있기 때문) 그러면 환자가 자기 요청 상태를
// 바꾸고 자기 기기로 "약국이 확인했어요" 푸시를 띄울 수 있다 — 무결성·알림 스푸핑.
//
// 그래서 앱 계층에서 "호출자가 약국 계정인가"를 먼저 확인하고,
// 쿼리에도 pharmacy_id 를 명시해 2차 방어를 건다.
export async function ownedPharmacyId(supabase: ServerClient, uid: string): Promise<string | null> {
  const { data } = await supabase.from('pharmacies').select('id').eq('owner_id', uid).maybeSingle()
  return data?.id ?? null
}
