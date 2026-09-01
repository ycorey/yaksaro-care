import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { logger } from '@/lib/logger'

// §23 민감정보(건강정보) 동의 기록 — 로그인·동의 게이트 양쪽이 함께 쓴다.
//
// ⚠️ 이 함수를 `'use server'` 파일에 두면 안 된다. 그 파일의 **모든 export 는 호출 가능한
//    엔드포인트**가 되어, 동의 화면을 보지 않고도 동의를 찍을 수 있는 경로가 열린다 —
//    동의 증거의 증거력을 스스로 깎는 일이다. 그래서 평범한 모듈로 둔다.
//
// 쓰기 권한은 046 이 `authenticated` 에 두 컬럼(`consent_health`, `consent_health_at`)만
// 부여해 뒀다. RLS(`profiles_self`)가 본인 행으로 좁힌다.

export type ConsentWriteResult =
  | { outcome: 'recorded' }        // 이번에 새로 기록됨
  | { outcome: 'already' }         // 이미 동의 상태 — 최초 시각을 덮지 않았다
  | { outcome: 'failed'; reason: string }

/**
 * 동의를 기록한다. **결과를 반드시 확인할 수 있게 돌려준다.**
 *
 * 왜 `.select()` 가 필요한가: `.eq('consent_health', false)` 로 최초 시각을 보존하는 대신,
 * 조건에 걸리는 행이 없으면 Supabase 는 **0행 갱신 + error=null** 을 준다.
 * 그러면 "이미 동의함" 과 "RLS 가 가려 못 씀" 이 똑같이 성공으로 보인다.
 * 이 저장소가 이 함수를 만들게 된 계기가 바로 "동의를 받는다고 적어 놓고 아무 데도
 * 기록되지 않던" 무음 실패였다 — 재발이 또 조용하면 고친 의미가 없다.
 */
export async function recordHealthConsent(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ConsentWriteResult> {
  const { data, error } = await supabase
    .from('profiles')
    .update({ consent_health: true, consent_health_at: new Date().toISOString() })
    .eq('id', userId)
    .eq('consent_health', false)   // 최초 동의 시각을 재로그인이 덮지 않게
    .select('id')

  if (error) {
    logger.warn('auth', '민감정보 동의 기록 실패', error.message)
    return { outcome: 'failed', reason: error.message }
  }
  if (data && data.length > 0) return { outcome: 'recorded' }

  // 0행이다. 이미 true 였는지, 아니면 쓰지 못한 것인지 갈라 본다.
  const { data: current, error: readError } = await supabase
    .from('profiles').select('consent_health').eq('id', userId).maybeSingle()

  if (readError || !current) {
    logger.warn('auth', '동의 기록 0행 — 상태 확인 실패', readError?.message ?? 'profile 없음')
    return { outcome: 'failed', reason: readError?.message ?? 'profile 없음' }
  }
  if (current.consent_health) return { outcome: 'already' }

  // 여전히 false 인데 갱신도 안 됐다 = 권한·RLS 가 막고 있다. 조용히 넘어가면 안 된다.
  logger.error('auth', '동의 기록이 0행으로 실패했다(권한·RLS 의심)', userId)
  return { outcome: 'failed', reason: '0행 갱신' }
}
