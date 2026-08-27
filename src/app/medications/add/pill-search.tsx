'use client'

import { useState } from 'react'
import { CircleNotch, MagnifyingGlass, Pill } from '@phosphor-icons/react'
import AddForm, { type Selected } from './add-form'
import { BackButton } from '../back-button'
import MemberContextBadge from '@/components/member-context-badge'
import type { Member } from '@/lib/member'

// 낱알로 찾기 — 모양·색·각인으로 drug_identification(067)을 검색해 기존 등록 플로우에 합류.
// 선택 결과는 BoxOcrAddFlow 와 같은 방식으로 AddForm(initialSelected)에 인라인 전달한다.

// 적재 실데이터(25,360행) distinct 와 대조 완료(2026-08-27) — 항목 일치, 순서는 빈도순
// (원형 39%·타원형 29%·장방형 27% 가 전체의 94%. 색 복합값("노랑, 투명")은 포함 매칭으로 잡힌다)
const SHAPES = ['원형', '타원형', '장방형', '기타', '팔각형', '사각형', '삼각형', '마름모형', '육각형', '오각형', '반원형']
const COLORS = ['하양', '분홍', '노랑', '주황', '갈색', '파랑', '연두', '초록', '빨강', '회색', '보라', '청록', '자주', '검정', '남색', '투명']

type Candidate = {
  drugId: string; itemSeq: string; itemName: string; entpName: string | null
  imageUrl: string | null; shape: string | null; colors: string | null
  print: string | null; formName: string | null
}

export default function PillSearchFlow({ member }: { member: Member }) {
  const [shape, setShape]   = useState<string | null>(null)
  const [colors, setColors] = useState<string[]>([])
  const [print, setPrint]   = useState('')
  const [busy, setBusy]     = useState(false)
  const [result, setResult] = useState<{ items: Candidate[]; more: boolean } | null>(null)
  const [selected, setSelected] = useState<Selected | null>(null)

  function toggleColor(c: string) {
    setColors(prev => prev.includes(c) ? prev.filter(v => v !== c) : prev.length >= 2 ? [prev[1], c] : [...prev, c])
  }

  async function search() {
    if (!shape && colors.length === 0 && !print.trim()) return
    setBusy(true)
    try {
      const qs = new URLSearchParams()
      if (shape) qs.set('shape', shape)
      if (colors[0]) qs.set('color1', colors[0])
      if (colors[1]) qs.set('color2', colors[1])
      if (print.trim()) qs.set('print', print.trim())
      const res = await fetch(`/api/drugs/identify?${qs}`)
      const data = await res.json()
      setResult(res.ok ? { items: data.items ?? [], more: !!data.more } : { items: [], more: false })
    } catch {
      setResult({ items: [], more: false })
    } finally {
      setBusy(false)
    }
  }

  function pick(c: Candidate) {
    setSelected({
      type: 'drug', id: c.drugId, item_seq: c.itemSeq,
      name: c.itemName, sub: c.entpName ?? '', source: 'db', imageUrl: c.imageUrl,
    })
  }

  // 선택 후: 기존 등록 폼에 합류 (저장 경로 무변경 — addMedication → drug_id)
  if (selected) {
    return (
      <div className="space-y-5 anim-scale-in">
        <div className="flex items-center gap-2">
          <button onClick={() => setSelected(null)} className="min-w-[44px] min-h-[44px] flex items-center justify-center -ml-2 text-yc-neutral600" aria-label="뒤로">
            ‹
          </button>
          <h1 className="text-xl font-bold text-yc-neutral900 flex-1">약 등록</h1>
          <MemberContextBadge member={member} />
        </div>
        <AddForm initialTab="prescription" initialSelected={selected} />
      </div>
    )
  }

  const canSearch = !!shape || colors.length > 0 || !!print.trim()

  return (
    <div className="space-y-6 anim-scale-in">
      <div className="flex items-center gap-2">
        <BackButton />
        <h1 className="text-xl font-bold text-yc-neutral900 flex-1">낱알로 찾기</h1>
        <MemberContextBadge member={member} />
      </div>

      <p className="text-sm text-yc-neutral500">
        약에 새겨진 모양·색·글자로 찾아요. 아는 것만 골라도 돼요.
      </p>

      {/* 모양 */}
      <div>
        <p className="text-base font-semibold text-yc-neutral900 mb-2">모양</p>
        <div className="grid grid-cols-4 gap-2">
          {SHAPES.map(s => (
            <button key={s} onClick={() => setShape(shape === s ? null : s)}
              className={`min-h-[48px] rounded-yc-md text-sm font-medium border transition-colors ${
                shape === s ? 'bg-yc-green600 text-white border-yc-green600' : 'bg-white text-yc-neutral700 border-yc-neutral200 active:bg-yc-neutral50'
              }`}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* 색 (최대 2) */}
      <div>
        <p className="text-base font-semibold text-yc-neutral900 mb-2">색 <span className="text-sm font-normal text-yc-neutral500">(최대 2개)</span></p>
        <div className="grid grid-cols-4 gap-2">
          {COLORS.map(c => (
            <button key={c} onClick={() => toggleColor(c)}
              className={`min-h-[48px] rounded-yc-md text-sm font-medium border transition-colors ${
                colors.includes(c) ? 'bg-yc-green600 text-white border-yc-green600' : 'bg-white text-yc-neutral700 border-yc-neutral200 active:bg-yc-neutral50'
              }`}>
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* 각인 */}
      <div>
        <p className="text-base font-semibold text-yc-neutral900 mb-2">새겨진 글자 <span className="text-sm font-normal text-yc-neutral500">(선택)</span></p>
        <input
          value={print} onChange={e => setPrint(e.target.value)}
          placeholder="예: TYLENOL, 마크, 숫자"
          className="w-full rounded-yc-md border border-yc-neutral200 px-4 py-3 text-base text-yc-neutral900 placeholder:text-yc-neutral400 focus:outline-none focus:border-yc-green600"
        />
      </div>

      <button onClick={search} disabled={!canSearch || busy}
        className="w-full min-h-[52px] rounded-yc-lg bg-yc-green600 text-white text-base font-semibold flex items-center justify-center gap-2 disabled:bg-yc-neutral200 disabled:text-yc-neutral400 active:bg-yc-green700 transition-colors">
        {busy ? <CircleNotch size={20} className="animate-spin" /> : <MagnifyingGlass size={20} weight="bold" />}
        약 찾기
      </button>

      {/* 결과 */}
      {result && (
        <div className="space-y-3">
          {result.more && (
            <p className="text-sm text-yc-neutral600 bg-yc-neutral50 rounded-yc-md px-3 py-2.5">
              결과가 20개가 넘어요 — 새겨진 글자나 색을 더 골라 주세요.
            </p>
          )}
          {result.items.length === 0 ? (
            <p className="text-sm text-yc-neutral500 text-center py-6">조건에 맞는 약을 찾지 못했어요. 조건을 바꿔 다시 찾아보세요.</p>
          ) : (
            <ul className="space-y-2">
              {result.items.map(c => (
                <li key={c.itemSeq}>
                  <button onClick={() => pick(c)}
                    className="w-full flex items-center gap-3 bg-white rounded-yc-lg border border-yc-neutral200 px-4 py-3 min-h-[64px] text-left active:bg-yc-neutral50 transition-colors">
                    {c.imageUrl ? (
                      // 식약처 원본 이미지 — next/image 도메인 미등록이라 img 사용, lazy 필수
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.imageUrl} alt="" loading="lazy" decoding="async"
                        className="w-14 h-8 object-contain flex-shrink-0 rounded" />
                    ) : (
                      <span className="w-14 h-8 flex items-center justify-center flex-shrink-0"><Pill size={20} className="text-yc-neutral300" /></span>
                    )}
                    <span className="flex-1 min-w-0">
                      <span className="block text-base font-bold text-yc-neutral900 truncate">{c.itemName}</span>
                      <span className="block text-sm text-yc-neutral500 truncate">
                        {[c.entpName, c.print && `각인 ${c.print}`].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-yc-neutral500">
            자료: 식품의약품안전처 · 같은 모양의 다른 약일 수 있어요 — 정확한 확인은 담당 약사와 상담하세요
          </p>
        </div>
      )}
    </div>
  )
}
