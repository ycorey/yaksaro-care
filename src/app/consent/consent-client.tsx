'use client'

import { useActionState, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { signOutAndPurge } from '@/lib/purge'
import { acceptHealthConsent, type ConsentState } from './actions'

// 동의 게이트 화면. 로그인 화면의 체크박스와 **같은 문구**를 쓴다 —
// 두 곳의 동의 문언이 갈리면 어느 쪽에 동의한 것인지 말할 수 없게 된다.
//
// 이 화면이 실제로 만나는 사람은 대부분 **신규가 아니라 기존 사용자**다.
// 동의 기록이 없던 시절에 가입해 미동의로 남은 계정이고, 그들은 갑자기
// 탭 어디를 눌러도 여기로 되돌아오는 경험을 한다. 그래서 이 화면은 셋을 말해야 한다:
//   ① 왜 여기로 왔는지  ② 이미 등록한 약은 어떻게 되는지  ③ 동의하지 않으면 어떻게 나가는지
export default function ConsentClient({
  userName, hasMedications, next,
}: {
  userName: string | null
  hasMedications: boolean
  next: string | null
}) {
  const router = useRouter()
  const [consented, setConsented] = useState(false)
  const [age14, setAge14] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [state, formAction, pending] = useActionState<ConsentState, FormData>(
    acceptHealthConsent,
    { error: null },
  )

  async function handleLogout() {
    setLeaving(true)
    await signOutAndPurge().catch(() => {})
    router.push('/login')
  }

  return (
    <div className="min-h-screen bg-yc-pageBg px-5 py-10">
      <div className="mx-auto w-full max-w-[430px]">
        <h1 className="font-display text-2xl text-yc-neutral900 mb-3">
          {userName ? `${userName}님, ` : ''}동의가 한 가지 필요해요
        </h1>

        {/* ① 왜 여기로 왔는지 — 조용한 리다이렉트만 겪으면 "앱이 고장났다" 로 읽힌다 */}
        <p className="text-base text-yc-neutral700 leading-relaxed mb-3">
          복약 정보는 법에서 <b>민감정보</b>로 정한 항목이라, 동의를 받은 뒤에만 보여 드릴 수 있어요.
          그래서 약 지갑·오늘 복약 화면이 이 안내로 되돌아옵니다.
        </p>

        {/* ② 이미 등록한 약은 어떻게 되는지 */}
        {hasMedications && (
          <div className="mb-6 rounded-2xl border border-yc-green100 bg-yc-green50 px-5 py-4">
            <p className="text-sm text-yc-neutral700 leading-relaxed">
              <b>이미 등록하신 약은 그대로 있어요.</b> 지워지지 않았고, 동의하시면 바로 다시 보입니다.
            </p>
          </div>
        )}

        <form action={formAction}>
          {next && <input type="hidden" name="next" value={next} />}

          <label className="flex items-start gap-3 py-4 min-h-[52px] cursor-pointer">
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

          <label className="flex items-start gap-3 py-4 min-h-[52px] cursor-pointer">
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
            disabled={pending || leaving}
            className="mt-6 w-full min-h-[56px] rounded-2xl bg-yc-green600 text-white font-bold text-base disabled:opacity-50 active:scale-[0.99] transition-transform"
          >
            {pending ? '저장 중…' : '동의하고 계속하기'}
          </button>
        </form>

        {/* ③ 동의하지 않을 자유가 실제로 있어야 동의다.
            예전엔 "동의하지 않으셔도 됩니다" 라고 적어 놓고 나가는 버튼이 없었다. */}
        <div className="mt-8 rounded-2xl border border-yc-neutral200 bg-white px-5 py-4">
          <p className="text-sm text-yc-neutral600 leading-relaxed mb-3">
            동의하지 않으셔도 됩니다. 다만 복약 정보를 다루는 기능은 이용할 수 없어요.
          </p>
          <button
            type="button"
            onClick={handleLogout}
            disabled={pending || leaving}
            className="w-full min-h-[52px] rounded-xl border border-yc-neutral200 text-base font-semibold text-yc-neutral700 active:bg-yc-neutral50 disabled:opacity-50"
          >
            {leaving ? '로그아웃 중…' : '동의하지 않고 로그아웃'}
          </button>
        </div>

        <div className="mt-6 flex flex-wrap justify-center gap-4">
          <Link href="/privacy" target="_blank" rel="noopener noreferrer"
            className="min-h-[52px] flex items-center text-sm text-yc-green600 underline underline-offset-2">
            개인정보 처리방침
          </Link>
          <Link href="/settings"
            className="min-h-[52px] flex items-center text-sm text-yc-neutral500 underline underline-offset-2">
            설정
          </Link>
          <Link href="/account-deletion"
            className="min-h-[52px] flex items-center text-sm text-yc-neutral500 underline underline-offset-2">
            계정 삭제
          </Link>
        </div>
      </div>
    </div>
  )
}
