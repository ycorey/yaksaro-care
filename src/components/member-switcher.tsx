'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CaretDown, Plus, Check, Users } from '@phosphor-icons/react'
import { MEMBER_COOKIE, type Member } from '@/lib/member'

// 가족 멤버 전환 + 추가. 쿠키(yc_member)로 활성 멤버를 정하고 새로고침으로 서버 반영.
export default function MemberSwitcher({ members, activeId }: { members: Member[]; activeId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const active = members.find(m => m.id === activeId) ?? members[0]

  function select(id: string) {
    document.cookie = `${MEMBER_COOKIE}=${id}; path=/; max-age=${60 * 60 * 24 * 365}`
    setOpen(false)
    router.refresh()
  }

  async function addMember() {
    const name = window.prompt('가족 이름을 입력하세요 (예: 어머니)')?.trim()
    if (!name) return
    setBusy(true)
    try {
      const res = await fetch('/api/members', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error()
      toast.success(`${name} 추가했어요`)
      if (data.member?.id) select(data.member.id)
      else router.refresh()
    } catch { toast.error('추가 실패'); setBusy(false) }
  }

  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-3 h-9 rounded-full bg-yc-neutral100 active:bg-yc-neutral200 text-sm font-semibold text-yc-neutral700">
        <Users weight="fill" size={15} className="text-yc-green700" />
        {active?.name ?? '본인'}
        <CaretDown size={13} weight="bold" className="text-yc-neutral400" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute z-40 top-full mt-1 left-0 min-w-44 bg-white border border-yc-neutral200 rounded-yc-md shadow-[var(--yc-shadow-lg)] overflow-hidden">
            {members.map(m => (
              <button key={m.id} onClick={() => select(m.id)}
                className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left text-sm active:bg-yc-neutral50 border-b border-yc-neutral100 last:border-0">
                <span className="text-yc-neutral900">
                  {m.name}{m.is_self && <span className="text-xs text-yc-neutral400 ml-1">본인</span>}
                </span>
                {m.id === activeId && <Check weight="bold" size={15} className="text-yc-green600" />}
              </button>
            ))}
            <button onClick={addMember} disabled={busy}
              className="w-full flex items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-yc-green700 active:bg-yc-green50 disabled:opacity-50">
              <Plus weight="bold" size={15} /> 가족 추가
            </button>
          </div>
        </>
      )}
    </div>
  )
}
