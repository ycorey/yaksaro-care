'use client'

/**
 * 첫 약 등록 완료(first_drug_added) 발화.
 *
 * 약이 실제로 담겼는지는 약지갑이 안다. 등록 경로가 둘(수동 등록 = 서버 액션 redirect,
 * OCR 일괄 등록 = /api/medications/bulk)이라 각 저장 지점에 붙이면 누락·중복이 생기므로,
 * "약지갑에 약이 1개 이상 보이는 순간"을 한 곳에서 잡는다.
 *
 * 약물명·개수 등 어떤 내용도 담지 않는다 — 발생 사실만 기록한다.
 * 기기별 1회 보장(localStorage). 기기를 바꾸면 다시 한 번 잡힐 수 있으나,
 * 이 지표의 목적(서비스가 실제로 쓰이기 시작했는가)에는 충분하다.
 */

import { useEffect } from 'react'
import { track } from '@/lib/analytics'

const FLAG = 'yc_ga_first_drug'

export default function FirstDrugTracker({ hasMeds }: { hasMeds: boolean }) {
  useEffect(() => {
    if (!hasMeds) return
    try {
      if (localStorage.getItem(FLAG)) return
      localStorage.setItem(FLAG, '1')
    } catch {
      return // 저장소가 막혀 있으면 중복 발화 위험이 있으므로 아예 쏘지 않는다
    }
    track('first_drug_added')
  }, [hasMeds])

  return null
}
