'use client'

import Link from 'next/link'

export default function AppHeader({ actions }: { actions?: React.ReactNode }) {
  return (
    <div className="md:hidden flex items-center justify-between pt-1 pb-1">
      <Link href="/home">
        {/* 로컬 SVG 워드마크 — next/image 최적화 이득 없음 */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand-assets/logo-wordmark.svg"
          alt="약사로"
          decoding="async"
          style={{ height: '32px', width: 'auto' }}
        />
      </Link>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
