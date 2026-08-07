import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/logger'

// 전역 `drugs` 마스터에 행을 만드는 유일한 경로.
//
// 왜 필요한가: drugs 는 SELECT 정책만 있는 ETL 전용 테이블인데, 사용자가 약을 담을 때
// 클라이언트가 보낸 item_seq·약품명·제조사·이미지 URL 을 admin(service_role) 으로 그대로
// upsert 하던 경로가 3곳 있었다. is_canceled 기본값이 false 라 삽입 즉시 전체 검색 결과에
// 정상 품목처럼 노출되고, image_url 은 <img src> 로 렌더되므로 임의 외부 호스트를 넣으면
// 그 약을 보는 모든 사용자의 IP·UA 가 제3자에게 노출된다.
//
// 그래서 사용자 입력은 "조회 키"로만 쓰고, 저장되는 값은 전부 식약처 허가정보에서 다시 가져온다.

// 운영 데이터 43,224건이 전부 9자리 (2026-08 확인)
const ITEM_SEQ_RE = /^\d{9}$/
// 허가정보가 내려주는 이미지 호스트. 운영 데이터의 image_url 이 전부 이 호스트다.
const ALLOWED_IMAGE_HOST = /^https:\/\/nedrug\.mfds\.go\.kr\//

type LicenseItem = {
  ITEM_NAME?: string
  ENTP_NAME?: string
  BIG_PRDT_IMG_URL?: string
}

async function fetchLicenseByItemSeq(itemSeq: string): Promise<LicenseItem | null> {
  const key = process.env.MFDS_DRUG_LICENSE_KEY
  if (!key) return null
  const url = 'https://apis.data.go.kr/1471000/DrugPrdtPrmsnInfoService07/getDrugPrdtPrmsnInq07'
    + `?serviceKey=${encodeURIComponent(key)}`
    + `&item_seq=${encodeURIComponent(itemSeq)}`
    + '&numOfRows=1&pageNo=1&type=json'
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const json = await res.json()
    const items = json?.body?.items
    return (Array.isArray(items) ? items[0] : items) ?? null
  } catch {
    return null
  }
}

function safeImageUrl(raw: unknown): string | null {
  return typeof raw === 'string' && ALLOWED_IMAGE_HOST.test(raw) ? raw : null
}

/**
 * item_seq 로 drugs 행을 찾고, 없으면 허가정보에서 재취득해 생성한 뒤 UUID 를 돌려준다.
 * 형식이 어긋나거나 허가정보에 없는 품목이면 null — 호출부는 custom_name 등으로 폴백할 것.
 */
export async function resolveDrugIdByItemSeq(
  supabase: SupabaseClient<Database>,
  itemSeq: string,
): Promise<string | null> {
  if (!ITEM_SEQ_RE.test(itemSeq)) return null

  const { data: existing } = await supabase
    .from('drugs').select('id').eq('item_seq', itemSeq).maybeSingle()
  if (existing?.id) return existing.id

  const lic = await fetchLicenseByItemSeq(itemSeq)
  if (!lic?.ITEM_NAME) {
    logger.warn('drugs', '허가정보 미확인 item_seq — 마스터 생성 생략', itemSeq)
    return null
  }

  const admin = createAdminClient()
  const { data: created, error } = await admin
    .from('drugs')
    .upsert(
      {
        item_seq:  itemSeq,
        item_name: lic.ITEM_NAME,                 // 사용자 입력이 아니라 허가정보 값
        entp_name: lic.ENTP_NAME ?? null,
        image_url: safeImageUrl(lic.BIG_PRDT_IMG_URL),
      },
      { onConflict: 'item_seq' },
    )
    .select('id')
    .single()

  if (error) {
    logger.error('drugs', '마스터 생성 실패', error.message)
    return null
  }
  return created?.id ?? null
}
