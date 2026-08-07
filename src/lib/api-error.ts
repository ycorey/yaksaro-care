import { NextResponse } from 'next/server'
import { logger } from '@/lib/logger'

// DB 오류 응답 SSOT.
//
// Postgres/PostgREST 원문에는 컬럼명·CHECK 제약 이름·RLS 위반 문구
// ("new row violates row-level security policy for table ...")가 담긴다.
// 그대로 내보내면 스키마와 정책 구조가 그려져 공격자의 정찰 단계가 크게 짧아진다.
// 원문은 서버 로그에만 남기고 사용자에게는 행동 가능한 한 줄만 준다.
// Supabase(PostgREST) 오류는 message 외에 code·details·hint 를 함께 준다.
// message 만 남기면 "어느 제약이 왜 걸렸는지"가 사라져 로그만 보고는 재현이 어렵다.
type PgError = { message: string; code?: string; details?: string | null; hint?: string | null }

export function dbError(
  scope: string,
  error: PgError | null | undefined,
  userMessage = '처리에 실패했어요. 잠시 후 다시 시도해주세요.',
  status = 500,
) {
  logger.error(scope, 'DB 오류', error && {
    code:    error.code,
    message: error.message,
    details: error.details ?? undefined,
    hint:    error.hint ?? undefined,
  })
  return NextResponse.json({ error: userMessage }, { status })
}
