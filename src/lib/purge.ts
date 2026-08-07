'use client'

import { createClient } from '@/lib/supabase/client'
import { unsubscribeFromPush } from '@/lib/push-client'
import { MEMBER_COOKIE } from '@/lib/member'
import { FONT_SIZE_KEY } from '@/lib/font-size'

// 로그아웃 퍼지 SSOT.
//
// 이 앱은 실버세대·가족 공용 기기를 명시적 타겟으로 하므로, 계정이 바뀔 때 이전 사용자의
// 흔적이 남으면 그대로 계정 경계 위반이 된다. 로그아웃 경로가 3곳(프로필·설정·약사)이라
// 각자 정리하면 반드시 어긋나므로 여기 한 곳으로 모은다.
//
// 순서가 중요하다: 푸시 해제는 DELETE /api/push/subscribe 가 세션을 요구하므로
// **signOut 이전**에 해야 서버 행까지 지워진다.

/** localStorage·sessionStorage·앱 쿠키를 비운다. 기기 접근성 설정만 예외로 보존한다. */
export function purgeLocalState(): void {
  // 글자 크기는 개인정보가 아니라 **기기 접근성 설정**이다. 로그아웃 때 같이 지우면
  // 실버 사용자가 다음 로그인에서 화면이 20% 작아진 채 되돌리는 법을 모르게 된다.
  // (서버에도 남아 있지만 첫 페인트는 이 값이 결정한다)
  let fontSize: string | null = null
  try { fontSize = localStorage.getItem(FONT_SIZE_KEY) } catch { /* 접근 불가 */ }

  try { localStorage.clear() } catch { /* 사파리 프라이빗 등 */ }
  try { if (fontSize) localStorage.setItem(FONT_SIZE_KEY, fontSize) } catch { /* 동일 */ }
  // sessionStorage 에는 박스 OCR → 처방전 OCR 핸드오프용 사진(dataURL 원본)이 들어간다.
  // 설치형 PWA 는 앱 자체가 하나의 탭이라 로그아웃/로그인 사이에도 살아남는다.
  try { sessionStorage.clear() } catch { /* 동일 */ }
  for (const name of ['pending_pharmacy_id', MEMBER_COOKIE]) {
    try { document.cookie = `${name}=; Max-Age=0; path=/` } catch { /* 동일 */ }
  }
}

/**
 * 로그아웃 전체 시퀀스 — 푸시 구독 해제 → 세션 무효화 → 로컬 상태 파기.
 * 호출부는 이 함수만 부르고 뒤에 이동만 하면 된다.
 */
export async function signOutAndPurge(): Promise<void> {
  // 세션이 살아있을 때 해제해야 push_subscriptions 행이 지워진다.
  // 실패해도 로그아웃 자체는 계속 진행한다(기기에 구독이 남는 것보다 세션이 남는 게 더 나쁘다).
  await unsubscribeFromPush().catch(() => {})
  await createClient().auth.signOut()
  purgeLocalState()
}
