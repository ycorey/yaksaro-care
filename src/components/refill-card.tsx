// [STEP A] 곧 떨어지는 약 리필·재방문 알림 카드. 표시 전용. 넛지(정보형)이며 처방 지시 아님.
import type { RefillItem } from '@/lib/refill'

export default function RefillCard({ items }: { items: RefillItem[] }) {
  if (items.length === 0) return null
  return (
    <div className="bg-yc-warningBg border border-yc-warning/30 rounded-yc-xl px-5 py-4 space-y-3">
      <p className="text-sm font-bold text-yc-warningText">곧 떨어지는 약</p>
      <div className="space-y-2.5">
        {items.map(it => (
          <div key={it.id} className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-white bg-yc-warning rounded-full px-2 py-0.5 flex-shrink-0">
                {it.dDay === 0 ? '오늘' : `D-${it.dDay}`}
              </span>
              <span className="text-sm font-semibold text-yc-neutral900 truncate">{it.label}</span>
            </div>
            <p className="text-sm text-yc-neutral700 break-keep">
              {it.medNames.slice(0, 2).join(', ')}
              {it.medNames.length > 2 ? ` 외 ${it.medNames.length - 2}종` : ''} · {it.expiryLabel}까지
            </p>
          </div>
        ))}
      </div>
      <p className="text-xs text-yc-neutral600 leading-relaxed">필요하면 재방문·재처방을 미리 챙겨보세요.</p>
    </div>
  )
}
