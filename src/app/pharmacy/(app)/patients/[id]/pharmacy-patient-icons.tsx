'use client'

import { Flask, Pill, Warning, Lock } from '@phosphor-icons/react'

export function MedThumbnailIcon({ isSupplement }: { isSupplement: boolean }) {
  return isSupplement
    ? <Flask    weight="fill" size={20} className="text-yc-green700 opacity-70" />
    : <Pill     weight="fill" size={20} className="text-yc-blue500 opacity-60" />
}

export function InteractionWarningIcon() {
  return <Warning weight="fill" size={13} className="text-yc-warningText flex-shrink-0" />
}

export function LockEmptyIcon() {
  return <Lock weight="regular" size={48} className="text-yc-neutral300" />
}
