'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Hospital, MagnifyingGlass, X } from '@phosphor-icons/react'

type Result = { name: string; address: string; phone: string | null }

// 단골약국: 이름·지역 검색으로 등록 + 해제. (QR 연결은 별도 — /store 흐름)
export default function PharmacyLink({ initialName }: { initialName: string | null }) {
  const router = useRouter()
  const [searching, setSearching] = useState(false)
  const [query, setQuery]   = useState('')
  const [results, setResults] = useState<Result[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy]     = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function onQuery(v: string) {
    setQuery(v)
    if (timer.current) clearTimeout(timer.current)
    if (v.trim().length < 2) { setResults(null); return }
    timer.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/pharmacies/search?q=${encodeURIComponent(v.trim())}`)
        setResults(await res.json())
      } catch { setResults([]) } finally { setLoading(false) }
    }, 300)
  }

  async function connect(r: Result) {
    setBusy(true)
    try {
      const res = await fetch('/api/profile/set-pharmacy', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: r.name, phone: r.phone, address: r.address }),
      })
      if (!res.ok) throw new Error()
      toast.success(`${r.name} 단골약국으로 등록했어요`)
      setSearching(false); setQuery(''); setResults(null)
      router.refresh()
    } catch { toast.error('등록 실패') } finally { setBusy(false) }
  }

  async function unlink() {
    setBusy(true)
    try {
      const res = await fetch('/api/profile/clear-pharmacy', { method: 'POST' })
      if (!res.ok) throw new Error()
      toast.success('단골약국을 해제했어요')
      router.refresh()
    } catch { toast.error('해제 실패') } finally { setBusy(false) }
  }

  return (
    <div className="bg-white rounded-yc-lg px-5 py-4 shadow-[var(--yc-shadow-sm)] space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Hospital weight="fill" size={22} className="text-yc-neutral400 flex-shrink-0" />
          <p className="text-sm font-semibold text-yc-neutral900 truncate">
            {initialName ?? <span className="text-yc-neutral500 font-medium">단골약국 미등록</span>}
          </p>
        </div>
        {initialName ? (
          <button onClick={unlink} disabled={busy}
            className="text-sm text-yc-neutral500 active:text-yc-error px-3 min-h-[44px] rounded-yc-md active:bg-yc-errorBg flex-shrink-0 disabled:opacity-50">
            해제
          </button>
        ) : (
          <button onClick={() => setSearching(s => !s)}
            className="text-sm font-semibold text-yc-green700 px-3 min-h-[44px] rounded-yc-md bg-yc-green50 active:opacity-90 flex-shrink-0">
            {searching ? '닫기' : '약국 검색'}
          </button>
        )}
      </div>

      {initialName && (
        <button onClick={() => setSearching(s => !s)}
          className="text-sm text-yc-green700 font-semibold active:opacity-80">
          {searching ? '닫기' : '다른 약국으로 변경'}
        </button>
      )}

      {searching && (
        <div className="space-y-2 pt-1">
          <div className="relative">
            <MagnifyingGlass size={16} weight="bold" className="absolute left-3 top-1/2 -translate-y-1/2 text-yc-neutral400" />
            <input
              value={query}
              onChange={e => onQuery(e.target.value)}
              placeholder="약국 이름·지역으로 검색 (예: 강서구 온누리)"
              autoComplete="off"
              className="w-full h-11 pl-9 pr-9 border border-yc-neutral200 rounded-yc-md text-sm focus:outline-none focus:border-yc-green600"
            />
            {query && (
              <button onClick={() => { setQuery(''); setResults(null) }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-yc-neutral400 w-7 h-7 flex items-center justify-center">
                <X size={14} />
              </button>
            )}
          </div>
          {loading && <p className="text-xs text-yc-neutral500 px-1">검색 중…</p>}
          {results && results.length === 0 && !loading && (
            <p className="text-xs text-yc-neutral500 px-1">검색 결과가 없어요. 지역+이름으로 입력해보세요 (예: 강서구 온누리).</p>
          )}
          {results && results.length > 0 && (
            <div className="border border-yc-neutral200 rounded-yc-md overflow-hidden divide-y divide-yc-neutral100 max-h-64 overflow-y-auto">
              {results.map((r, i) => (
                <button key={i} onClick={() => connect(r)} disabled={busy}
                  className="w-full text-left px-4 py-3 active:bg-yc-neutral50 disabled:opacity-50">
                  <p className="text-sm font-semibold text-yc-neutral900 truncate">{r.name}</p>
                  {r.address && <p className="text-xs text-yc-neutral500 truncate mt-0.5">{r.address}</p>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
