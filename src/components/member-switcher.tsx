'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CaretDown, Plus, Check, Users, PencilSimple, Trash, X } from '@phosphor-icons/react'
import { setActiveMemberCookie, type Member } from '@/lib/member'

// 가족 멤버 전환 + 관리(추가·이름수정·삭제). 쿠키(yc_member)로 활성 멤버를 정하고 새로고침으로 서버 반영.
// window.prompt 대신 앱 내 인라인 폼 사용(PWA standalone·인앱브라우저 안전, 실버 톤 일관).
export default function MemberSwitcher({ members, activeId }: { members: Member[]; activeId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newRelation, setNewRelation] = useState('')
  const [consent, setConsent] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const active = members.find(m => m.id === activeId) ?? members[0]

  function select(id: string) {
    setActiveMemberCookie(id)
    setOpen(false)
    router.refresh()
  }

  function resetForms() {
    setAdding(false); setNewName(''); setNewRelation(''); setConsent(false)
    setEditingId(null); setEditName(''); setConfirmDeleteId(null)
  }

  async function addMember() {
    const name = newName.trim()
    if (!name || !consent) return
    setBusy(true)
    try {
      const res = await fetch('/api/members', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, relation: newRelation.trim() || null }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(`${name} 추가했어요`)
      resetForms()
      if (data.member?.id) select(data.member.id)
      else router.refresh()
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : '추가 실패')
    } finally { setBusy(false) }
  }

  async function renameMember(id: string) {
    const name = editName.trim()
    if (!name) return
    setBusy(true)
    try {
      const res = await fetch('/api/members', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error)
      toast.success('이름을 바꿨어요')
      resetForms()
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : '수정 실패')
    } finally { setBusy(false) }
  }

  async function deleteMember(id: string) {
    setBusy(true)
    try {
      const res = await fetch('/api/members', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error)
      toast.success('가족을 삭제했어요')
      resetForms()
      if (id === activeId) {
        const self = members.find(m => m.is_self)
        if (self) { select(self.id); return }
      }
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : '삭제 실패')
    } finally { setBusy(false) }
  }

  function close() { setOpen(false); resetForms() }

  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-3.5 h-10 rounded-full bg-yc-neutral100 active:bg-yc-neutral200 text-sm font-semibold text-yc-neutral700">
        <Users weight="fill" size={15} className="text-yc-green700" />
        {active?.name ?? '본인'}
        <CaretDown size={13} weight="bold" className="text-yc-neutral400" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={close} />
          <div className="absolute z-40 top-full mt-1 left-0 min-w-60 bg-white border border-yc-neutral200 rounded-yc-md shadow-[var(--yc-shadow-lg)] overflow-hidden">
            {members.map(m => (
              <div key={m.id} className="border-b border-yc-neutral100 last:border-0">
                {editingId === m.id ? (
                  // 이름 수정 인라인 폼
                  <div className="flex items-center gap-2 px-3 py-2.5">
                    <input autoFocus value={editName} onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') renameMember(m.id) }}
                      className="flex-1 min-w-0 px-2.5 h-11 rounded-yc-sm border border-yc-neutral200 text-sm focus:outline-none focus:border-yc-green600" />
                    <button onClick={() => renameMember(m.id)} disabled={busy} aria-label="저장"
                      className="w-12 h-12 flex items-center justify-center rounded-yc-sm bg-yc-green600 text-white active:bg-yc-green700 disabled:opacity-50">
                      <Check weight="bold" size={16} />
                    </button>
                    <button onClick={() => { setEditingId(null); setEditName('') }} aria-label="취소"
                      className="w-12 h-12 flex items-center justify-center rounded-yc-sm bg-yc-neutral100 text-yc-neutral600 active:bg-yc-neutral200">
                      <X weight="bold" size={16} />
                    </button>
                  </div>
                ) : confirmDeleteId === m.id ? (
                  // 삭제 확인 인라인
                  <div className="flex items-center justify-between gap-2 px-4 py-3 bg-yc-errorBg">
                    <span className="text-sm text-yc-neutral700">약·기록도 함께 삭제돼요. 삭제할까요?</span>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button onClick={() => deleteMember(m.id)} disabled={busy}
                        className="px-3.5 h-11 rounded-yc-sm bg-yc-error text-white text-sm font-semibold active:opacity-90 disabled:opacity-50">삭제</button>
                      <button onClick={() => setConfirmDeleteId(null)}
                        className="px-3.5 h-11 rounded-yc-sm bg-white border border-yc-neutral200 text-yc-neutral600 text-sm active:bg-yc-neutral100">취소</button>
                    </div>
                  </div>
                ) : (
                  // 일반 행: 선택 + (비본인) 수정·삭제
                  <div className="flex items-center">
                    <button onClick={() => select(m.id)}
                      className="flex-1 min-w-0 flex items-center justify-between gap-2 px-4 py-3 text-left text-sm active:bg-yc-neutral50">
                      <span className="text-yc-neutral900 truncate">
                        {m.name}{m.is_self && <span className="text-xs text-yc-neutral400 ml-1">본인</span>}
                      </span>
                      {m.id === activeId && <Check weight="bold" size={15} className="text-yc-green600 flex-shrink-0" />}
                    </button>
                    {!m.is_self && (
                      <div className="flex items-center pr-2 gap-0.5">
                        <button onClick={() => { setEditingId(m.id); setEditName(m.name); setConfirmDeleteId(null) }}
                          aria-label={`${m.name} 이름 수정`}
                          className="w-12 h-12 flex items-center justify-center rounded-yc-sm text-yc-neutral500 active:bg-yc-neutral100">
                          <PencilSimple size={16} />
                        </button>
                        <button onClick={() => { setConfirmDeleteId(m.id); setEditingId(null) }}
                          aria-label={`${m.name} 삭제`}
                          className="w-12 h-12 flex items-center justify-center rounded-yc-sm text-yc-error active:bg-yc-errorBg">
                          <Trash size={16} />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {adding ? (
              // 가족 추가 인라인 폼
              <div className="p-3 space-y-2 bg-yc-neutral50">
                <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addMember() }}
                  placeholder="가족 이름 (예: 어머니)"
                  className="w-full px-3 h-10 rounded-yc-sm border border-yc-neutral200 text-sm focus:outline-none focus:border-yc-green600" />
                <input value={newRelation} onChange={e => setNewRelation(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addMember() }}
                  placeholder="관계 (선택 · 예: 부모·자녀·배우자)"
                  className="w-full px-3 h-10 rounded-yc-sm border border-yc-neutral200 text-sm focus:outline-none focus:border-yc-green600" />
                {/* 가족(제3자) 건강정보 저장 동의 고지 — 개인정보보호법 민감정보 */}
                <label className="flex items-start gap-2 px-1 py-1 cursor-pointer">
                  <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}
                    className="mt-0.5 w-5 h-5 accent-yc-green600 flex-shrink-0" />
                  <span className="text-xs text-yc-neutral600 leading-relaxed">
                    본인의 동의를 받았으며, 미성년·피보호자는 보호자로서 약을 관리합니다.
                  </span>
                </label>
                <div className="flex items-center gap-2">
                  <button onClick={addMember} disabled={busy || !newName.trim() || !consent}
                    className="flex-1 h-12 rounded-yc-sm bg-yc-green600 text-white text-base font-semibold active:bg-yc-green700 disabled:opacity-50">추가</button>
                  <button onClick={() => { setAdding(false); setNewName(''); setNewRelation(''); setConsent(false) }}
                    className="px-4 h-12 rounded-yc-sm bg-white border border-yc-neutral200 text-yc-neutral600 text-base active:bg-yc-neutral100">취소</button>
                </div>
              </div>
            ) : (
              <button onClick={() => { setAdding(true); setConfirmDeleteId(null); setEditingId(null) }}
                className="w-full flex items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-yc-green700 active:bg-yc-green50">
                <Plus weight="bold" size={15} /> 가족 추가
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
