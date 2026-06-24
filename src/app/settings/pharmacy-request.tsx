'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Phone, Package, Clock, CalendarCheck, MagnifyingGlass } from '@phosphor-icons/react'

type ReqType = 'callback' | 'dispense_prep' | 'pickup' | 'consult_booking' | 'stock_inquiry'
export type PharmacyRequestRow = {
  id: string; type: ReqType; note: string | null
  status: 'open' | 'acknowledged' | 'done' | 'canceled'; created_at: string
  reply_text?: string | null; replied_at?: string | null; patient_ack_at?: string | null
}

const TYPES: { key: ReqType; label: string; desc: string; Icon: typeof Phone }[] = [
  { key: 'callback',        label: '전화 요청',      desc: '약사님이 전화 드려요',        Icon: Phone },
  { key: 'dispense_prep',   label: '조제 미리 준비',  desc: '방문 전 미리 준비해 주세요',   Icon: Package },
  { key: 'pickup',          label: '픽업 예약',      desc: '찾으러 갈 시간을 알려요',      Icon: Clock },
  { key: 'consult_booking', label: '상담 예약',      desc: '전화·방문 상담 시간 잡기',     Icon: CalendarCheck },
  { key: 'stock_inquiry',   label: '재고 문의',      desc: '약이 있는지 확인해 주세요',     Icon: MagnifyingGlass },
]
const LABEL: Record<ReqType, string> = Object.fromEntries(TYPES.map(t => [t.key, t.label])) as Record<ReqType, string>
const STATUS: Record<PharmacyRequestRow['status'], { label: string; cls: string }> = {
  open:         { label: '접수됨',    cls: 'bg-yc-green100 text-yc-green700' },
  acknowledged: { label: '약국 확인',  cls: 'bg-yc-infoBg text-yc-infoText' },
  done:         { label: '완료',      cls: 'bg-yc-neutral100 text-yc-neutral600' },
  canceled:     { label: '취소',      cls: 'bg-yc-neutral100 text-yc-neutral500' },
}

export default function PharmacyRequest({
  pharmacyName, defaultPhone, initialRequests, walletMeds = [],
}: {
  pharmacyName: string; defaultPhone: string | null; initialRequests: PharmacyRequestRow[]
  walletMeds?: { id: string; name: string }[]
}) {
  const router = useRouter()
  const [requests, setRequests] = useState(initialRequests)
  const [open, setOpen]   = useState<ReqType | null>(null)
  const [note, setNote]   = useState('')
  const [phone, setPhone] = useState(defaultPhone ?? '')
  const [meds, setMeds]   = useState<Set<string>>(new Set())
  const [busy, setBusy]   = useState(false)

  function selectType(t: ReqType) {
    setOpen(prev => prev === t ? null : t)
    setNote(''); setPhone(defaultPhone ?? ''); setMeds(new Set())
  }
  function toggleMed(name: string) {
    setMeds(prev => { const n = new Set(prev); if (n.has(name)) n.delete(name); else n.add(name); return n })
  }

  async function send() {
    if (!open) return
    setBusy(true)
    try {
      // 조제 미리 준비: 선택한 약 목록(텍스트)을 메모에 첨부 — 처방전 이미지 전송 아님(저장 0)
      const medList = open === 'dispense_prep' && meds.size > 0 ? `[준비 약] ${[...meds].join(', ')}` : ''
      const finalNote = [medList, note.trim()].filter(Boolean).join(' · ')
      const res = await fetch('/api/pharmacy/request', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: open, note: finalNote, contact_phone: phone }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setRequests(r => [data.request, ...r])
      setOpen(null); setNote('')
      toast.success('약국에 요청을 보냈어요')
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : '요청 실패')
    } finally { setBusy(false) }
  }

  async function cancel(id: string) {
    setBusy(true)
    try {
      const res = await fetch('/api/pharmacy/request', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!res.ok) throw new Error()
      setRequests(r => r.map(x => x.id === id ? { ...x, status: 'canceled' } : x))
      toast.success('요청을 취소했어요')
      router.refresh()
    } catch { toast.error('취소 실패') } finally { setBusy(false) }
  }

  async function ack(id: string) {
    setBusy(true)
    try {
      const res = await fetch('/api/pharmacy/request', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'ack' }),
      })
      if (!res.ok) throw new Error()
      setRequests(r => r.map(x => x.id === id ? { ...x, patient_ack_at: new Date().toISOString() } : x))
      toast.success('확인했어요')
    } catch { toast.error('실패했어요') } finally { setBusy(false) }
  }

  return (
    <div className="bg-white rounded-yc-lg px-5 py-4 shadow-[var(--yc-shadow-sm)] space-y-3">
      <p className="text-sm font-semibold text-yc-neutral900">{pharmacyName}에 요청</p>

      {/* 요청 유형 */}
      <div className="space-y-2">
        {TYPES.map(({ key, label, desc, Icon }) => (
          <div key={key}>
            <button onClick={() => selectType(key)}
              className={`w-full flex items-center gap-3 rounded-yc-md px-4 min-h-[52px] text-left transition-colors ${open === key ? 'bg-yc-green50 border border-yc-green100' : 'bg-yc-neutral50 active:bg-yc-neutral100'}`}>
              <Icon weight="fill" size={20} className="text-yc-green700 flex-shrink-0" />
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold text-yc-neutral900">{label}</span>
                <span className="block text-xs text-yc-neutral500">{desc}</span>
              </span>
            </button>
            {open === key && (
              <div className="mt-2 space-y-2 px-1">
                {key === 'dispense_prep' && walletMeds.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs text-yc-neutral500">준비할 약을 골라 알려요 (선택 · 처방전 사진 아님)</p>
                    <div className="flex flex-wrap gap-1.5">
                      {walletMeds.map(m => (
                        <button key={m.id} type="button" onClick={() => toggleMed(m.name)}
                          className={`text-xs px-3 py-2 rounded-full border transition-colors ${meds.has(m.name) ? 'bg-yc-green600 text-white border-yc-green600' : 'bg-white text-yc-neutral700 border-yc-neutral200 active:bg-yc-neutral50'}`}>
                          {m.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <input value={note} onChange={e => setNote(e.target.value)} maxLength={300}
                  placeholder="메모 (선택 · 예: 오후 5시쯤 갈게요)"
                  className="w-full h-11 px-3 border border-yc-neutral200 rounded-yc-md text-sm focus:outline-none focus:border-yc-green600" />
                <input value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" maxLength={30}
                  placeholder="연락받을 번호 (선택)"
                  className="w-full h-11 px-3 border border-yc-neutral200 rounded-yc-md text-sm focus:outline-none focus:border-yc-green600" />
                <div className="flex items-center gap-2">
                  <button onClick={send} disabled={busy}
                    className="flex-1 h-12 rounded-yc-lg bg-yc-green600 text-white text-base font-semibold active:bg-yc-green700 disabled:opacity-50">
                    요청 보내기
                  </button>
                  <button onClick={() => setOpen(null)}
                    className="px-4 h-12 rounded-yc-lg bg-yc-neutral100 text-yc-neutral600 text-sm active:bg-yc-neutral200">취소</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 보낸 요청 */}
      {requests.length > 0 && (
        <div className="pt-1 space-y-2 border-t border-yc-neutral100">
          <p className="text-xs font-semibold text-yc-neutral500 pt-2">보낸 요청</p>
          {requests.slice(0, 6).map(r => (
            <div key={r.id} className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm text-yc-neutral800 truncate">{LABEL[r.type]}{r.note ? ` · ${r.note}` : ''}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS[r.status].cls}`}>{STATUS[r.status].label}</span>
                  {(r.status === 'open' || r.status === 'acknowledged') && (
                    <button onClick={() => cancel(r.id)} disabled={busy}
                      className="text-xs text-yc-neutral500 active:text-yc-error disabled:opacity-50">취소</button>
                  )}
                </div>
              </div>
              {/* 약사 답(자유 텍스트) + 확인 1탭 */}
              {r.reply_text && (
                <div className="rounded-yc-md bg-yc-green50 px-3 py-2 space-y-1.5">
                  <p className="text-sm text-yc-neutral800 break-keep">💬 {r.reply_text}</p>
                  {r.patient_ack_at ? (
                    <p className="text-xs text-yc-green700 font-semibold">확인함</p>
                  ) : (
                    <button onClick={() => ack(r.id)} disabled={busy}
                      className="min-h-[44px] px-4 rounded-yc-md bg-yc-green600 text-white text-sm font-semibold active:bg-yc-green700 disabled:opacity-50">
                      확인했어요
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-yc-neutral500 leading-relaxed pt-1">
        복약·부작용 등 의학적 상담은 약국에 전화하거나 방문해 주세요. 이 요청은 예약·문의용이에요.
      </p>
    </div>
  )
}
