'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Hospital, MagnifyingGlass, Keyboard, X } from '@phosphor-icons/react'

type Result = { name: string; address: string; phone: string | null }

// 단골약국 등록:
//  · 약국 코드 입력(주 경로) → 실제 단골(regular_pharmacy_id) 연결. QR 스캔이 실패해도 앱 안에서 확실히 등록.
//  · 이름·지역 검색(보조) → 표시용 이름만 저장(B2B 연결 아님).
export default function PharmacyLink({ initialName }: { initialName: string | null }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'code' | 'search'>('code')

  // 코드 등록
  const [code, setCode] = useState('')
  const [linking, setLinking] = useState(false)

  // 이름 검색
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Result[] | null>(null)
  const [loading, setLoading] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [busy, setBusy] = useState(false)

  async function linkByCode() {
    const v = code.trim()
    if (!v || linking) return
    setLinking(true)
    try {
      const res = await fetch('/api/profile/link-store', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store: v }),
      })
      const data = await res.json().catch(() => ({}))
      if (data?.linked) {
        toast.success(data.name ? `${data.name} 단골약국으로 등록했어요` : '단골약국으로 등록했어요')
        setOpen(false); setCode('')
        router.refresh()
      } else {
        toast.error('코드를 찾을 수 없어요. 약국에 표시된 코드를 확인해주세요')
      }
    } catch { toast.error('등록 실패') } finally { setLinking(false) }
  }

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
      setOpen(false); setQuery(''); setResults(null)
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
          <button onClick={() => setOpen(o => !o)}
            className="text-sm font-semibold text-yc-green700 px-3 min-h-[44px] rounded-yc-md bg-yc-green50 active:opacity-90 flex-shrink-0">
            {open ? '닫기' : '약국 등록'}
          </button>
        )}
      </div>

      {initialName && (
        <button onClick={() => setOpen(o => !o)}
          className="text-sm text-yc-green700 font-semibold active:opacity-80">
          {open ? '닫기' : '다른 약국으로 변경'}
        </button>
      )}

      {open && (
        <div className="space-y-3 pt-1">
          {/* 탭 전환 */}
          <div className="flex gap-1 bg-yc-neutral100 rounded-yc-md p-1">
            <button onClick={() => setTab('code')}
              className={`flex-1 flex items-center justify-center gap-1.5 h-10 rounded-yc-sm text-sm font-semibold transition-colors ${tab === 'code' ? 'bg-white text-yc-neutral900 shadow-[var(--yc-shadow-sm)]' : 'text-yc-neutral500'}`}>
              <Keyboard size={16} weight="bold" /> 약국 코드
            </button>
            <button onClick={() => setTab('search')}
              className={`flex-1 flex items-center justify-center gap-1.5 h-10 rounded-yc-sm text-sm font-semibold transition-colors ${tab === 'search' ? 'bg-white text-yc-neutral900 shadow-[var(--yc-shadow-sm)]' : 'text-yc-neutral500'}`}>
              <MagnifyingGlass size={16} weight="bold" /> 이름 검색
            </button>
          </div>

          {tab === 'code' ? (
            <div className="space-y-2">
              <div className="flex gap-2">
                <input
                  value={code}
                  onChange={e => setCode(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') linkByCode() }}
                  placeholder="약국 코드 (예: k7m2npqr)"
                  autoComplete="off" autoCapitalize="none" spellCheck={false}
                  aria-label="약국 코드"
                  className="flex-1 h-11 px-3 border border-yc-neutral200 rounded-yc-md text-sm tracking-wider focus:outline-none focus:border-yc-green600"
                />
                <button onClick={linkByCode} disabled={linking || !code.trim()}
                  className="h-11 px-4 rounded-yc-md bg-yc-green600 text-white text-sm font-semibold active:bg-yc-green700 disabled:opacity-50 flex-shrink-0">
                  {linking ? '등록 중…' : '등록'}
                </button>
              </div>
              <p className="text-xs text-yc-neutral500 leading-relaxed px-1">
                약국 카운터·QR 안내문에 적힌 8자리 코드를 입력하면 단골로 연결돼요.
                QR을 찍었는데 연결이 안 될 때 이 방법을 쓰세요.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
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
              <p className="text-xs text-yc-neutral400 px-1">이름 검색은 표시용이에요. 단골 연동은 &lsquo;약국 코드&rsquo;로 등록해주세요.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
