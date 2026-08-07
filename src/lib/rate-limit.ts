import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/logger'

// 사용자별 호출 쿼터. 유료 외부 API(CLOVA·OpenAI·Anthropic) 과금과
// data.go.kr 일일 한도 소진(전 사용자 약품 조회 마비)을 막는 용도다.
//
// 카운터는 047 의 consume_quota() — service_role 전용이라 클라이언트가 만질 수 없고,
// 한도(limit)는 DB 가 아니라 여기서 비교하므로 인자 조작으로 우회할 수 없다.

export type Quota = { bucket: string; limit: number; windowSec: number }

const DAY = 86_400
const HOUR = 3_600

export const QUOTAS = {
  /** 처방전 사진 인식 — CLOVA OCR + GPT. 하루 30장이면 실사용자에겐 충분하다. */
  ocr:        { bucket: 'ocr',        limit: 30,  windowSec: DAY },
  /** 제품 박스 인식 — 동일 파이프라인 */
  ocrProduct: { bucket: 'ocr_product', limit: 40,  windowSec: DAY },
  /** 문헌 근거 요약 — PubMed + Claude. 캐시 키가 입력 파생이라 미스 유도가 쉽다. */
  evidence:   { bucket: 'evidence',   limit: 20,  windowSec: DAY },
  /** 공공 API 조회(허가정보·심평원) — 일일 한도 공유 자원 */
  publicApi:  { bucket: 'public_api', limit: 300, windowSec: HOUR },
} as const satisfies Record<string, Quota>

/**
 * 호출을 1회 계상하고 한도 내인지 돌려준다.
 * userId 는 반드시 서버에서 auth.getUser() 로 검증한 값이어야 한다(클라이언트 입력 금지).
 *
 * 계측 인프라 장애 시에는 true(통과)로 폴백한다 — 이 쿼터는 데이터가 아니라 비용을
 * 보호하므로, 카운터가 죽었다고 사용자 기능까지 막지는 않는다.
 */
export async function consumeQuota(userId: string, q: Quota): Promise<boolean> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin.rpc('consume_quota', {
      p_user:       userId,
      p_bucket:     q.bucket,
      p_window_sec: q.windowSec,
    })
    if (error) {
      logger.error('quota', `${q.bucket} 계측 실패 — 통과 처리`, error.message)
      return true
    }
    const count = typeof data === 'number' ? data : 0
    if (count > q.limit) {
      logger.warn('quota', `${q.bucket} 한도 초과`, `${count}/${q.limit}`)
      return false
    }
    return true
  } catch (e) {
    logger.error('quota', `${q.bucket} 예외 — 통과 처리`, e)
    return true
  }
}

/** 429 응답 본문 — 사용자에게 보여줄 안내 문구 */
export function quotaExceededMessage(q: Quota): string {
  return q.windowSec >= DAY
    ? '오늘 사용 한도를 넘었어요. 내일 다시 시도해주세요.'
    : '잠시 후 다시 시도해주세요.'
}
