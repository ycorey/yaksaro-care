'use client'

import { Prohibit, Warning, Eye, CheckCircle, Pill } from '@phosphor-icons/react'

type Severity = 'contraindicated' | 'warning' | 'monitor' | 'ok'

export function SeverityIcon({ severity, size = 20 }: { severity: Severity; size?: number }) {
  switch (severity) {
    case 'contraindicated': return <Prohibit    weight="fill" size={size} />
    case 'warning':         return <Warning     weight="fill" size={size} />
    case 'monitor':         return <Eye         weight="fill" size={size} />
    case 'ok':              return <CheckCircle weight="fill" size={size} />
  }
}

export function SummaryIcon({ hasIssues }: { hasIssues: boolean }) {
  return hasIssues
    ? <Prohibit    weight="fill" size={28} className="text-red-600" />
    : <CheckCircle weight="fill" size={28} className="text-green-600" />
}

export function DrugEmptyIcon() {
  return <Pill weight="light" size={48} className="text-gray-300" />
}
