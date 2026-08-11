import { initSentry } from '@/lib/sentry-init'

// 브라우저 진입점(Next 15.3+ 규약). 클라이언트에서 터진 예외·error.tsx 로 떨어진 실패가
// 여기 초기화된 SDK 로 전송된다.
initSentry('client')
