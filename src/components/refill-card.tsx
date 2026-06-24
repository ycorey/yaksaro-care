// [STEP A/C] 곧 떨어지는 약 리필·재방문 알림 카드. 넛지(정보형)이며 처방 지시 아님.
// B2B 단골약국 연결 시 '미리 준비 요청' 원탭(STEP C) 노출.
import type { RefillItem } from '@/lib/refill'
import RefillRequestButton from './refill-request-button'

export default function RefillCard({ items, hasB2BPharmacy = false, isSelfMember = true }: { items: RefillItem[]; hasB2BPharmacy?: boolean; isSelfMember?: boolean }) {
  if (items.length === 0) return null
  return (
    <div className="bg-yc-warningBg border border-yc-warning/30 rounded-yc-xl px-5 py-4 space-y-3">
      <p className="text-base font-bold text-yc-warningText">곧 떨어지는 약</p>
      <div className="space-y-2.5">
        {items.map(it => (
          <div key={it.id} className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white bg-yc-warning rounded-full px-2.5 py-0.5 flex-shrink-0">
                {it.dDay === 0 ? '오늘' : `D-${it.dDay}`}
              </span>
              <span className="text-base font-bold text-yc-neutral900 truncate">{it.label}</span>
            </div>
            <p className="text-base text-yc-neutral700 break-keep">
              {it.medNames.slice(0, 2).join(', ')}
              {it.medNames.length > 2 ? ` 외 ${it.medNames.length - 2}종` : ''} · {it.expiryLabel}까지
            </p>
            {hasB2BPharmacy && (
              <div className="pt-1.5">
                {/* 가족 멤버 활성 시 약명 비첨부(RLS 가족 격리와 일관 — 약사에 약명 우회 노출 차단) */}
                <RefillRequestButton medNames={isSelfMember ? it.medNames : []} />
              </div>
            )}
          </div>
        ))}
      </div>
      <p className="text-sm text-yc-neutral600 leading-relaxed">필요하면 재방문·재처방을 미리 챙겨보세요.</p>
    </div>
  )
}
