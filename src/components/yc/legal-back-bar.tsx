'use client'

import { useRouter } from 'next/navigation'

// 법정 고지 4화면(`/privacy`·`/terms`·`/permissions`·`/account-deletion`)의 탈출구.
//
// 왜 필요한가: 이 화면들은 길다(실측 스크롤 6,173 / 1,109 / 1,287 / 2,233px).
// 유일한 출구가 최하단 16~20px 링크였고, `manifest.webmanifest` 가 `display:standalone`
// 이라 **브라우저 뒤로가기가 없다.**
//
// ⚠️ `router.back()` 만 쓰면 죽는 자리가 있다. 로그인 화면의 처리방침 링크는
//    `target="_blank"` 로 새 탭을 여는데(체크 상태를 잃지 않으려는 조치),
//    **그 탭은 히스토리가 1이라 back() 이 아무 일도 하지 않는다.**
//    한쪽 수정이 다른 쪽 수정을 무력화하는 자리라, 히스토리 유무를 보고 갈라야 한다.
//    판정은 **클릭 시점**에 한다 — 렌더 시점에 알 필요가 없고, 상태로 들고 있으면
//    effect 안에서 setState 하게 되어 규칙 위반이자 SSR 불일치 소지가 된다.
//
// 목적지를 `/settings` 로 두는 이유: 로그인 사용자는 설정으로 돌아가고,
// 비로그인 사용자는 `settings/layout.tsx` 가 `/login` 으로 보낸다 — 한 목적지가 둘 다 맞는다.
// (예전 하단 링크는 `/login` 고정이라 로그인 사용자가 `/home` 으로 튕겨 설정으로 못 돌아갔다.)
const FALLBACK = '/settings'

function useLeave() {
  const router = useRouter()
  return () => {
    if (typeof window !== 'undefined' && window.history.length > 1) router.back()
    else router.push(FALLBACK)
  }
}

export function LegalBackBar({ title }: { title: string }) {
  const leave = useLeave()
  return (
    <div className="sticky top-0 z-10 -mx-6 mb-4 flex items-center gap-2 border-b border-yc-neutral100 bg-yc-pageBg/95 px-3 py-2 backdrop-blur">
      <button
        type="button"
        onClick={leave}
        className="flex h-[52px] w-[52px] flex-shrink-0 items-center justify-center rounded-full text-lg text-yc-neutral700 active:bg-yc-neutral100"
        aria-label="돌아가기"
      >
        ←
      </button>
      <span className="truncate text-base font-semibold text-yc-neutral900">{title}</span>
    </div>
  )
}

/** 문서 맨 아래의 보조 출구. 상단 백 바가 있어도 남겨 둔다 —
 *  6,000px 을 내려온 사람에게 "위로 올라가서 나가세요" 는 출구가 아니다. */
export function LegalBottomExit() {
  const leave = useLeave()
  return (
    <button
      type="button"
      onClick={leave}
      className="min-h-[52px] text-sm text-yc-green600 underline underline-offset-2"
    >
      ← 돌아가기
    </button>
  )
}
