'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { acceptHealthConsent, type ConsentState } from './actions'

// 동의 게이트 화면. 로그인 화면의 체크박스와 **같은 문구**를 쓴다 —
// 두 곳의 동의 문언이 갈리면 어느 쪽에 동의한 것인지 말할 수 없게 된다.
//
// 터치 타겟은 52px 이상(실버 세대 대상). 체크박스 행을 `py-4` 로 두는 이유다.
export default function ConsentClient({ userName }: { userName: string | null }) {
  const [consented, setConsented] = useState(false)
  const [age14, setAge14] = useState(false)
  const [state, formAction, pending] = useActionState<ConsentState, FormData>(
    acceptHealthConsent,
    { error: null },
  )

  return (
    <div className="min-h-screen bg-yc-pageBg px-5 py-10">
      <div className="mx-auto w-full max-w-[430px]">
        <h1 className="font-display text-2xl text-yc-neutral900 mb-2">
          {userName ? `${userName}님, ` : ''}시작하기 전에
        </h1>
        <p className="text-sm text-yc-neutral600 leading-relaxed mb-8">
          약사로케어는 복약 정보를 다루기 때문에, 법에 따라 아래 동의를 받은 뒤에만
          약 정보를 보여 드릴 수 있어요.
        </p>

        <form action={formAction}>
          <label className="flex items-start gap-3 py-4 cursor-pointer">
            <input
              id="consent-check"
              type="checkbox"
              name="consent"
              checked={consented}
              onChange={e => setConsented(e.target.checked)}
              className="mt-0.5 w-6 h-6 rounded accent-yc-green600 flex-shrink-0"
            />
            <span className="text-base text-yc-neutral700 leading-relaxed">
              <span className="font-bold text-yc-neutral900">[필수] 민감정보 수집·이용 동의</span>
              <br />
              처방전·복약이력·건강기능식품 정보를 수집하여 복약관리 서비스 제공에 활용하는 것에 동의합니다.
            </span>
          </label>

          <label className="flex items-start gap-3 py-4 cursor-pointer">
            <input
              id="age14-check"
              type="checkbox"
              name="age14"
              checked={age14}
              onChange={e => setAge14(e.target.checked)}
              className="mt-0.5 w-6 h-6 rounded accent-yc-green600 flex-shrink-0"
            />
            <span className="text-base text-yc-neutral700 leading-relaxed">
              <span className="font-bold text-yc-neutral900">[필수] 만 14세 이상입니다</span>
            </span>
          </label>

          {/* 오류는 조건부로 렌더한다 — 숨긴 채 자리만 잡아 두면 스크린리더가 평소에도 읽는다 */}
          {state.error && (
            <p role="alert" className="mt-2 mb-4 text-sm font-medium text-red-600">
              {state.error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="mt-6 w-full min-h-[56px] rounded-2xl bg-yc-green600 text-white font-bold text-base disabled:opacity-50 active:scale-[0.99] transition-transform"
          >
            {pending ? '저장 중…' : '동의하고 시작하기'}
          </button>
        </form>

        {/* 동의하지 않을 자유가 실제로 있어야 동의다. 나가는 길을 같은 화면에 둔다. */}
        <div className="mt-8 space-y-3 text-center">
          <p className="text-sm text-yc-neutral500 leading-relaxed">
            동의하지 않으셔도 됩니다. 다만 복약 정보를 다루는 기능은 이용할 수 없어요.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link href="/privacy" target="_blank" rel="noopener noreferrer"
              className="text-sm text-yc-green600 underline underline-offset-2 py-2">
              개인정보 처리방침
            </Link>
            <Link href="/settings"
              className="text-sm text-yc-neutral500 underline underline-offset-2 py-2">
              설정
            </Link>
            <Link href="/account-deletion"
              className="text-sm text-yc-neutral500 underline underline-offset-2 py-2">
              계정 삭제
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
