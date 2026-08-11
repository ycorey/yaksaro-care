import { cookies } from 'next/headers'
import LoginClient from './login-client'

// 이 페이지가 서버 컴포넌트인 이유는 딱 하나 — `pending_pharmacy_id` 쿠키를 읽기 위해서다.
//
// 8/7 보안 작업이 이 쿠키를 httpOnly 로 바꿨는데, 값을 쓰는 쪽은 여전히 `document.cookie`
// 로 읽고 있었다. 그래서 **항상 null** 이 됐고, QR 세션 유실 방어 3중(쿠키 → URL 파라미터 →
// localStorage) 중 쿠키 층이 조용히 죽었다. 죽은 층이 하필 "인앱 브라우저에서 쿠키가
// 날아가는 경우" 를 담당하던 층이라, 주석은 방어한다고 적혀 있는데 실제로는 안 하고 있었다.
// (e2e qr-social-sim 의 `redirect_to에 store_id` 단언이 이걸 계속 잡고 있었지만, dev
//  하이드레이션이 죽어 있어 스위트 전체가 빨간불이라 신호가 묻혀 있었다.)
//
// httpOnly 를 되돌리는 대신 서버가 읽어서 클라이언트에 건넨다 — 방어도 유지되고 값도 산다.
export default async function LoginPage() {
  const cookieStore = await cookies()
  const pendingPharmacyId = cookieStore.get('pending_pharmacy_id')?.value ?? null

  return <LoginClient pendingPharmacyId={pendingPharmacyId} />
}
