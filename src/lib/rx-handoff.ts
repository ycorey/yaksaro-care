'use client'

import { createClient } from '@/lib/supabase/client'

// 박스 OCR 이 약봉투로 판정했을 때, 찍은 사진을 처방전 OCR 화면으로 넘기는 통로.
// 생산자(box-ocr-scanner)와 소비자(ocr-uploader)가 규약을 따로 들고 있으면 반드시 어긋나므로
// 키·봉인·검증을 여기 한 곳에 둔다.
//
// 왜 봉인이 필요한가: sessionStorage 는 오리진+탭 단위인데 설치형 PWA 는 앱 자체가 하나의 탭이라
// 로그아웃/로그인 사이에도 값이 살아남는다. 검증 없이 픽업하면 A 의 처방전 사진이 B 의
// 업로더에 로드된다. lib/purge 가 로그아웃 시 sessionStorage 를 비우지만, 그건 정상 로그아웃
// 경로에서만 동작하므로(앱 강제종료·이전 버전) 값 자체에도 소유자와 수명을 각인한다.

const KEY = 'yc_rx_handoff'
const TTL_MS = 5 * 60_000 // 즉시 이어받는 흐름이라 5분이면 충분히 넉넉하다

type Handoff = { uid: string; ts: number; img: string }

/** 처방전 사진을 넘긴다. 소유자·시각을 함께 각인한다. */
export async function putRxHandoff(dataUrl: string): Promise<void> {
  const { data: { user } } = await createClient().auth.getUser()
  if (!user) return
  const payload: Handoff = { uid: user.id, ts: Date.now(), img: dataUrl }
  try { sessionStorage.setItem(KEY, JSON.stringify(payload)) } catch { /* 용량초과 → 이미지 없이 이동 */ }
}

/**
 * 넘겨받은 사진을 꺼낸다. 소유자가 다르거나 오래됐으면 버리고 null.
 * 검증 결과와 무관하게 **항상 즉시 파기**한다(1회용).
 */
export async function takeRxHandoff(): Promise<string | null> {
  let raw: string | null = null
  try { raw = sessionStorage.getItem(KEY) } catch { /* 접근 불가 */ }
  try { sessionStorage.removeItem(KEY) } catch { /* 동일 */ }
  if (!raw) return null

  let h: Handoff
  try { h = JSON.parse(raw) as Handoff } catch { return null }
  if (typeof h?.img !== 'string' || typeof h?.uid !== 'string' || typeof h?.ts !== 'number') return null
  if (Date.now() - h.ts > TTL_MS) return null

  const { data: { user } } = await createClient().auth.getUser()
  return user?.id === h.uid ? h.img : null
}
