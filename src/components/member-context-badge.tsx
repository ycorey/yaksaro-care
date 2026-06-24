'use client'

import { Users } from '@phosphor-icons/react'
import type { Member } from '@/lib/member'

// 약 추가·OCR 전체화면 플로우는 (main) TabPager 밖이라 MemberSwitcher가 없다.
// "지금 누구에게 추가 중인지"를 항상 노출해 교차 입력(가족 약을 본인 지갑에 넣는 등)을 막는다.
// 본인이 아니면 그린 강조로 명시한다.
export default function MemberContextBadge({ member }: { member: Member }) {
  const isSelf = member.is_self
  return (
    <div
      className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-base font-semibold ${
        isSelf ? 'bg-yc-neutral100 text-yc-neutral600' : 'bg-yc-green100 text-yc-green700'
      }`}
    >
      <Users weight="fill" size={17} className={isSelf ? 'text-yc-neutral500' : 'text-yc-green700'} />
      <span>
        <span className="font-bold">{member.name}</span>에게 추가 중
      </span>
    </div>
  )
}
