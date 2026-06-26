'use client'

import { useState, useEffect, useRef } from 'react'
import { Pill, MagnifyingGlass } from '@phosphor-icons/react'

// 검수 화면에서 잘못 인식된 약품명을 정확한 허가 품목으로 교체하기 위한 경량 검색.
// /api/drugs/search 를 재사용하고, 선택 시 정식 품목 식별자(drug_id/item_seq)를 함께 돌려줘
// 저장 시 custom_name 폴백이 아니라 정확 매칭(DUR·상호작용 엔진 투입)이 되게 한다.
export type DrugPick = {
  drug_id:   string | null   // 로컬 DB drugs.id (source='db'일 때만)
  item_seq:  string | null   // 허가정보 품목기준코드 (source='api'면 이것만)
  name:      string
  entp_name: string | null
}

type DrugResult = {
  id: string; item_seq: string | null; item_name: string
  entp_name: string | null; image_url: string | null; source: 'db' | 'api'
}

export default function MedNameSearch({ initial = '', onPick, onCancel }: {
  initial?: string
  onPick: (pick: DrugPick) => void
  onCancel: () => void
}) {
  const [query, setQuery]     = useState(initial)
  const [results, setResults] = useState<DrugResult[]>([])
  const [loading, setLoading] = useState(false)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const q = query.trim()
    if (q.length < 1) {
      // 초기화도 비동기로 — effect 내 동기 setState 캐스케이드 방지
      const t = setTimeout(() => setResults([]), 0)
      return () => clearTimeout(t)
    }
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res  = await fetch(`/api/drugs/search?q=${encodeURIComponent(q)}`)
        const data = await res.json()
        setResults(Array.isArray(data?.drugs) ? data.drugs : [])
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 200)
    return () => { if (debounce.current) clearTimeout(debounce.current) }
  }, [query])

  return (
    <div className="space-y-2">
      <div className="relative">
        <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-yc-neutral400" />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          autoFocus
          placeholder="정확한 약 이름으로 검색 (예: 타이레놀정500)"
          className="w-full border border-yc-neutral300 rounded-yc-md pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:border-yc-green600"
        />
        {loading && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-yc-neutral400">검색 중…</span>}
      </div>

      {results.length > 0 && (
        <div className="border border-yc-neutral200 rounded-yc-md overflow-hidden max-h-56 overflow-y-auto">
          {results.map(d => (
            <button key={`${d.source}-${d.id}`} type="button"
              onClick={() => onPick({
                drug_id:   d.source === 'db' ? d.id : null,
                item_seq:  d.item_seq,
                name:      d.item_name,
                entp_name: d.entp_name,
              })}
              className="w-full text-left px-3 py-2.5 hover:bg-yc-neutral50 active:bg-yc-neutral100 flex items-center gap-2.5 border-b border-yc-neutral100 last:border-0"
            >
              <Pill weight="fill" size={15} className="text-yc-blue500 flex-shrink-0" />
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium text-yc-neutral900 truncate">{d.item_name}</span>
                {d.entp_name && <span className="block text-xs text-yc-neutral500 truncate">{d.entp_name}</span>}
              </span>
              {d.source === 'api' && <span className="text-[10px] bg-yc-infoBg text-yc-blue500 px-1.5 py-0.5 rounded flex-shrink-0">허가정보</span>}
            </button>
          ))}
        </div>
      )}

      <button type="button" onClick={onCancel}
        className="text-xs text-yc-neutral500 active:opacity-70">검색 취소</button>
    </div>
  )
}
