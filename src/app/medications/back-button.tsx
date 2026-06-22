'use client'

import { useRouter } from 'next/navigation'

export function BackButton() {
  const router = useRouter()
  return (
    <button
      type="button"
      onClick={() => router.back()}
      className="w-12 h-12 flex items-center justify-center rounded-full bg-white shadow-[var(--yc-shadow-sm)] text-yc-neutral700 text-lg active:bg-yc-neutral50"
      aria-label="뒤로가기"
    >
      ←
    </button>
  )
}
