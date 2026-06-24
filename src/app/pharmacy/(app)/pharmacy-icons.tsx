'use client'

import { UsersThree, QrCode } from '@phosphor-icons/react'

export function PharmacyEmptyIcon() {
  return <UsersThree weight="regular" size={48} className="text-yc-neutral300" />
}

export function PharmacyQrIcon() {
  return (
    <span className="w-10 h-10 rounded-yc-md bg-yc-green50 flex items-center justify-center flex-shrink-0">
      <QrCode weight="fill" size={22} className="text-yc-green600" />
    </span>
  )
}
