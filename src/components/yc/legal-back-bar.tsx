'use client'

import { useRouter } from 'next/navigation'

// 법정 고지 4화면(`/privacy`·`/terms`·`/permissions`·`/account-deletion`)의 상단 탈출구.
//
// 왜 필요한가: 이 화면들은 길다(실측 스크롤 6,173 / 1,109 / 1,287 / 2,233px).
// 유일한 출구가 최하단 16~20px 링크였고, `manifest.webmanifest` 가 `display:standalone`
// 이라 **브라우저 뒤로가기가 없다.** 게다가 하단 복귀 링크는 목적지가 `/login` 이라
// 로그인 사용자가 누르면 프록시가 `/home` 으로 보내 — 설정에서 출발한 사용자가
// 설정으로 돌아오지 못했다. `router.back()` 은 어디서 왔든 그 자리로 되돌린다.
//
// 스티키로 두는 이유: 6,000px 을 다 내려가야 나가는 문을 만나면 그건 문이 아니다.
export function LegalBackBar({ title }: { title: string }) {
  const router = useRouter()
  return (
    <div className="sticky top-0 z-10 -mx-6 mb-4 flex items-center gap-2 border-b border-yc-neutral100 bg-yc-pageBg/95 px-3 py-2 backdrop-blur">
      <button
        type="button"
        onClick={() => router.back()}
        className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full text-lg text-yc-neutral700 active:bg-yc-neutral100"
        aria-label="뒤로가기"
      >
        ←
      </button>
      <span className="truncate text-base font-semibold text-yc-neutral900">{title}</span>
    </div>
  )
}
