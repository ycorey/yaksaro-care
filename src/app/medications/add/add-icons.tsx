'use client'

import {
  Camera, QrCode, PencilSimple, Pill, Flask,
  MagnifyingGlass, Barcode, ClipboardText, Lock,
} from '@phosphor-icons/react'

const ICON_MAP = {
  camera:    Camera,
  qr:        QrCode,
  pencil:    PencilSimple,
  pill:      Pill,
  flask:     Flask,
  search:    MagnifyingGlass,
  barcode:   Barcode,
  clipboard: ClipboardText,
  lock:      Lock,
} as const

type IconName = keyof typeof ICON_MAP

export function AddIcon({
  name, size = 24, className,
}: {
  name: IconName; size?: number; className?: string
}) {
  const Icon = ICON_MAP[name]
  return <Icon weight="fill" size={size} className={className} />
}
