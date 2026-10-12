import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/logger'
import { licenseToDrugRow, type LicenseDetail } from '@/lib/drug-license'

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

const LICENSE_BASE = 'https://apis.data.go.kr/1471000/DrugPrdtPrmsnInfoService07'

// ⚠️ 2026-10-12 실측: 목록 API(getDrugPrdtPrmsnInq07)는 item_seq 파라미터를 **무시하고**
//    전체 42,713건의 첫 행("중외5%포도당생리식염액", 195500005)을 돌려준다(ITEM_SEQ·itemSeq 도 같다).
//    그래서 예전 코드는 drugs 에 없는 품목을 담을 때마다 **엉뚱한 이름**으로 마스터를 만들었다.
//    item_seq 를 지키는 것은 상세 API(getDrugPrdtPrmsnDtlInq06)다 — 없는 코드는 0건을 준다.
//    상세 API 에는 이미지 URL 이 없어서, 이미지는 목록 API 를 이름으로 찾고 ITEM_SEQ 가 같을 때만 쓴다.
async function licenseItems<T>(op: string, query: string): Promise<T[]> {
  const key = process.env.MFDS_DRUG_LICENSE_KEY
  if (!key) return []
  try {
    const res = await fetch(`${LICENSE_BASE}/${op}?serviceKey=${encodeURIComponent(key)}${query}&pageNo=1&type=json`,
      { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return []
    const items = (await res.json())?.body?.items
    return Array.isArray(items) ? items : items ? [items] : []
  } catch {
    return []
  }
}

async function fetchLicenseByItemSeq(itemSeq: string): Promise<LicenseDetail | null> {
  const items = await licenseItems<LicenseDetail>('getDrugPrdtPrmsnDtlInq06',
    `&item_seq=${encodeURIComponent(itemSeq)}&numOfRows=1`)
  // 응답이 요청한 품목인지 다시 확인한다 — 위 목록 API 사고가 되풀이되지 않게
  return items.find(i => String(i.ITEM_SEQ) === itemSeq) ?? null
}

async function fetchImageUrl(itemSeq: string, itemName: string): Promise<string | null> {
  const items = await licenseItems<{ ITEM_SEQ?: string; BIG_PRDT_IMG_URL?: string }>('getDrugPrdtPrmsnInq07',
    `&item_name=${encodeURIComponent(itemName)}&numOfRows=10`)
  return safeImageUrl(items.find(i => String(i.ITEM_SEQ) === itemSeq)?.BIG_PRDT_IMG_URL)
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
  const name = lic ? licenseToDrugRow(lic, itemSeq, null).item_name : ''
  if (!lic || !name) {
    logger.warn('drugs', '허가정보 미확인 item_seq — 마스터 생성 생략', itemSeq)
    return null
  }

  const admin = createAdminClient()
  const { data: created, error } = await admin
    .from('drugs')
    .upsert(licenseToDrugRow(lic, itemSeq, await fetchImageUrl(itemSeq, name)), { onConflict: 'item_seq' })
    .select('id')
    .single()

  if (error) {
    logger.error('drugs', '마스터 생성 실패', error.message)
    return null
  }
  return created?.id ?? null
}
