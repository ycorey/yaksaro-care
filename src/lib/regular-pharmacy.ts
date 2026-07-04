import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

export type LinkablePharmacy = {
  id: string
  name: string
  phone: string | null
  address: string | null
}

// 단골약국(B2B) 연결 시 표시 필드를 함께 저장한다.
// pharmacies는 owner(약사)만 SELECT 가능(RLS)이라, 환자 토큰으로는 regular_pharmacy_id 조인으로
// 약국명·전화를 읽을 수 없다. 이름·전화·주소를 profiles에 복사(denormalize)해 표시를 보장한다.
// 본인 profiles 행만 갱신 — 반드시 user 토큰 클라이언트로 호출(RLS profiles_self).
export async function updateRegularPharmacy(
  supabase: SupabaseClient<Database>,
  userId: string,
  pharmacy: LinkablePharmacy,
) {
  return supabase
    .from('profiles')
    .update({
      regular_pharmacy_id:      pharmacy.id,
      regular_pharmacy_name:    pharmacy.name,
      regular_pharmacy_phone:   pharmacy.phone,
      regular_pharmacy_address: pharmacy.address,
    })
    .eq('id', userId)
}
