import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

// §23 동의를 **API 층에서도** 요구한다.
//
// 왜 필요한가: 동의 게이트를 레이아웃에만 두면 **화면만 막히고 처리는 안 막힌다.**
// 감사 실측(2026-08-31): `consent_health` 를 조건으로 쓰는 곳이 레이아웃 2곳뿐이고
// **API 라우트 44개 중 0곳**이 그 값을 보지 않았다 — OCR 업로드·복약 일괄 저장이
// 인증만 통과하면 그대로 동작했다. 화면을 못 보게 하는 것과 민감정보를 처리하지 않는 것은
// 다른 일이고, §23 이 요구하는 것은 후자다.
//
// 적용 대상은 **환자의 건강정보를 쓰거나 만드는 경로**다. 조회만 하는 경로까지 막으면
// 동의 화면에서 자기 상태를 확인할 방법이 사라진다.
//
// cron 은 예외다 — service_role 로 돌고 사용자 세션이 없다. 대신 발송 대상 쿼리에서
// 걸러야 하며, 그건 별도 항목으로 남아 있다.

export type ConsentGuard = { ok: true } | { ok: false; response: NextResponse }

export async function requireHealthConsent(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ConsentGuard> {
  const { data, error } = await supabase
    .from('profiles')
    .select('consent_health')
    .eq('id', userId)
    .maybeSingle()

  // 판독 실패를 '미동의' 로 강등하지 않는다 — 그러면 DB 장애가 곧 전면 차단이 된다.
  // 막되(처리는 진행하지 않는다) 이유는 맞게 말한다: '동의 안 함' 이 아니라 '확인 불가'.
  if (error || !data) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: '동의 상태를 확인할 수 없어 처리하지 않았어요. 잠시 후 다시 시도해주세요.' },
        { status: 503 },
      ),
    }
  }

  if (!data.consent_health) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: '건강정보 수집·이용 동의가 필요해요.', code: 'consent_required' },
        { status: 403 },
      ),
    }
  }

  return { ok: true }
}
