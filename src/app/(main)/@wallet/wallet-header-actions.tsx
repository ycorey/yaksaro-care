'use client'

import Link from 'next/link'
import { GearSix, Plus } from '@phosphor-icons/react'

export function WalletHeaderActions() {
  return (
    <div className="flex items-center gap-2">
      <Link href="/settings"
        className="w-10 h-10 flex items-center justify-center rounded-yc-md bg-yc-neutral100 text-yc-neutral600 active:bg-yc-neutral200">
        <GearSix size={20} />
      </Link>
      <Link href="/medications/add"
        className="flex items-center gap-1 px-4 h-10 rounded-yc-md bg-yc-green600 text-white text-sm font-display active:bg-yc-green700">
        <Plus size={18} /> 추가
      </Link>
    </div>
  )
}
