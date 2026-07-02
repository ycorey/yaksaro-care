'use client'

import { Users } from '@phosphor-icons/react'
import type { Member } from '@/lib/member'

// 비본인(가족) 멤버가 활성일 때 "지금 누구 복약을 보는 중"인지 전 탭 공통으로 유지하는 컨텍스트 바.
// sticky라 스크롤로 멤버 스위처가 밀려나도 상단에 남는다 — 가족 전환 데이터 오해 방지 (7차 UX M2).
// 본인이면 렌더 0. sticky가 콘텐츠 전체 스크롤에 걸치려면 탭 콘텐츠 최상위 컨테이너의 직계 자식이어야 한다.
export default function MemberContextBar({ active }: { active: Pick<Member, 'name' | 'is_self'> }) {
  if (active.is_self) return null
  return (
    <div className="md:static sticky top-0 z-20 -mx-4 px-4 py-2.5 bg-yc-green50/95 backdrop-blur-sm border-b border-yc-green100 flex items-center gap-2">
      <Users weight="fill" size={15} className="text-yc-green700 flex-shrink-0" />
      <span className="text-sm font-bold text-yc-green700 truncate">{active.name}님의 복약을 보고 있어요</span>
    </div>
  )
}
