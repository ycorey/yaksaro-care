'use client'

import Link from 'next/link'

export default function AppHeader({ actions }: { actions?: React.ReactNode }) {
  return (
    <div className="md:hidden flex items-center justify-between pt-1 pb-1">
      {/* 이미지 높이(32px)가 그대로 히트영역이 되지 않도록 링크에 최소 터치 타겟을 준다 */}
      <Link href="/home" className="inline-flex items-center min-h-[52px] py-1.5">
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
