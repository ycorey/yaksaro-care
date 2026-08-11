// 형제 모듈은 상대경로+확장자로 부른다 — node --test 가 TS 를 그대로 읽어
// `@/` 별칭을 해석하지 못한다(ocr-product.ts 등과 동일 규약).
import { logger } from './logger.ts'
import type { PostgrestError } from '@supabase/supabase-js'

// cron 이 **조용히 성공하는 것**을 막는다.
//
// 복약·리필 리마인더 cron 은 조회 결과만 보고 대상자를 추렸다. 그래서 DB 조회가 실패하면
// 빈 배열이 되고 → "구독자 없음" → `{ sent: 0 }` + **HTTP 200** 을 돌려줬다.
// Vercel 은 이걸 성공한 실행으로 기록하므로, 알림이 며칠씩 안 나가도 아무 신호가 없다.
// (실측: 처방 49건 전부 refill_reminded_at 이 null 인데 조건 충족은 18건이었다.)
//
// "보낼 사람이 없었다" 와 "물어보지 못했다" 는 완전히 다른 사건이다. 후자는 실패로 알린다.
//
// next/server 를 일부러 import 하지 않는다 — 이 모듈이 Next 런타임에 묶이면
// 단위 테스트에서 로드할 수 없다. 조용한 실패를 막는 장치일수록 스스로 검증 가능해야 한다.
// 응답 변환은 호출부(route)가 한다.
export type CronFailure = {
  status: number
  body: { error: string; code: string | null }
}

export function cronDbFailure(
  scope: string,
  step: string,
  error: PostgrestError | null,
): CronFailure | null {
  if (!error) return null
  logger.error(scope, `${step} 조회 실패 — 이번 실행은 중단`, error.message)
  return {
    // 500 이어야 Vercel cron 실행이 실패로 남는다. 200 은 곧 "괜찮았다" 는 뜻이다.
    status: 500,
    // 원문 메시지는 서버 로그에만 둔다(스키마·정책 노출 방지).
    body: { error: `${step} 조회 실패로 중단했습니다`, code: error.code ?? null },
  }
}

// 발송 결과 요약 — 개별 푸시 실패는 실행 전체를 실패시키지 않지만(만료 구독 등 정상적인
// 실패가 섞인다) 응답에 숫자로 남겨 급증을 눈으로 볼 수 있게 한다.
export function settledFailures(results: PromiseSettledResult<unknown>[]): number {
  return results.filter(r => r.status === 'rejected').length
}
