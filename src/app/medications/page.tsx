import { redirect } from 'next/navigation'

// `/medications` 에는 화면이 없다(하위 add·ocr·history·pharmacy-request 만 있다).
// 그대로 두면 404 인데, `proxy.ts` 가 이 접두사를 보호경로로 잡고 있어 비로그인은
// "로그인 → 404" 라는 막다른 길을 걷는다. 약을 추가하러 온 것이므로 그쪽으로 보낸다.
export default function MedicationsPage() {
  redirect('/medications/add')
}
