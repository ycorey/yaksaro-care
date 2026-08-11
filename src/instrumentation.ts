import * as Sentry from '@sentry/nextjs'
import { initSentry } from '@/lib/sentry-init'

// 서버·엣지 런타임 진입점. Next 가 프로세스당 1회 호출한다.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') initSentry('server')
  if (process.env.NEXT_RUNTIME === 'edge') initSentry('edge')
}

// 서버 컴포넌트·route handler 에서 던져진 예외를 Next 가 여기로 넘겨준다.
// 오늘 pharmacy/(app)/layout 에 넣은 throw 같은 것이 이 경로로 잡힌다 —
// 화면(pharmacy/error.tsx)은 사용자를 구하고, 이건 우리에게 알린다.
export const onRequestError = Sentry.captureRequestError
