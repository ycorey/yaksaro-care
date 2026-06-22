'use client'

import type React from 'react'
import { toast } from 'sonner'

export default function ComingSoonCard({
  iconBg, icon, title, desc,
}: {
  iconBg: string; icon: React.ReactNode; title: string; desc: string
}) {
  return (
    <button
      type="button"
      onClick={() => toast('곧 만나보실 수 있어요', { description: '준비되는 대로 알려드릴게요.' })}
      className="w-full flex items-center gap-4 bg-white rounded-yc-xl border border-yc-neutral100 px-5 py-5 shadow-[var(--yc-shadow-sm)] text-left opacity-80 active:opacity-100 transition-opacity"
    >
      <div className={`w-12 h-12 rounded-yc-lg flex items-center justify-center flex-shrink-0 grayscale ${iconBg}`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-semibold text-base text-yc-neutral600">{title}</p>
          <span className="text-[10px] font-bold text-yc-neutral500 bg-yc-neutral100 px-2 py-0.5 rounded-full flex-shrink-0">추후 제공</span>
        </div>
        <p className="text-sm text-yc-neutral500 mt-0.5">{desc}</p>
      </div>
    </button>
  )
}
