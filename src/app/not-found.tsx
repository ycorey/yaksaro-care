import FailureScreen, { FailureAction } from '@/components/yc/failure-screen'

export const metadata = { title: '없는 화면 · 약사로케어' }

// 404. 설치형 PWA 는 주소창이 없어 오타 URL 이나 사라진 링크에 걸리면 되돌아갈 방법이
// 앱 강제종료뿐이었다 — 반드시 이동 수단을 준다.
export default function NotFound() {
  return (
    <FailureScreen
      title="없는 화면이에요"
      body={<>주소가 바뀌었거나<br />사라진 화면일 수 있어요.</>}
      actions={<FailureAction href="/home">홈으로</FailureAction>}
    />
  )
}
