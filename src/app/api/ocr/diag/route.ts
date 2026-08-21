import { NextResponse } from 'next/server'
import { isAuthorizedBearer } from '@/lib/bearer-auth'

export const runtime = 'nodejs'
export const maxDuration = 30

/**
 * 임시 진단 — 프로덕션 /api/ocr 의 "fetch failed" 원인 규명용.
 *
 * 로컬에서는 같은 키·URL 로 CLOVA 가 정상 응답하는데 Vercel 에서만 실패한다.
 * undici 의 "fetch failed" 는 겉메시지고 진짜 원인은 error.cause 에 있는데
 * 본 라우트가 message 만 로깅해 보이지 않았다 → 여기서 cause 체인을 읽는다.
 *
 * 비밀값은 응답에 싣지 않는다 — URL 은 호스트만, 시크릿은 길이만.
 * 인증: Authorization: Bearer <CRON_SECRET> (기존 크론과 동일 규약).
 * 원인 확정 후 이 라우트는 삭제한다.
 */
export async function GET(req: Request) {
  if (!isAuthorizedBearer(req, process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const url = process.env.CLOVA_OCR_API_URL ?? ''
  const secret = process.env.CLOVA_OCR_SECRET ?? ''
  const host = url.replace(/^https?:\/\/([^/]+).*$/, '$1')

  const out: Record<string, unknown> = {
    urlSet: !!url,
    urlHost: host || '(빈 값)',
    urlLen: url.length,
    secretLen: secret.length,
    region: process.env.VERCEL_REGION ?? null,
  }

  if (url) {
    try {
      // 실제 OCR 와 같은 엔드포인트로 최소 페이로드 — 어떤 HTTP 응답이든 오면 연결은 산 것.
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-OCR-SECRET': secret },
        body: JSON.stringify({
          version: 'V2', requestId: 'diag', timestamp: Date.now(),
          images: [{ format: 'jpg', name: 'diag', data: 'aGVsbG8=' }],
        }),
        signal: AbortSignal.timeout(15_000),
      })
      out.reachable = true
      out.httpStatus = res.status
      out.bodyHead = (await res.text()).slice(0, 120)
    } catch (e) {
      // cause 체인을 끝까지 편다 — ENOTFOUND(DNS)·ECONNREFUSED·ETIMEDOUT 이 여기 있다
      out.reachable = false
      const chain: string[] = []
      let cur: unknown = e
      for (let i = 0; cur && i < 5; i++) {
        const err = cur as { name?: string; message?: string; code?: string; cause?: unknown }
        chain.push(`${err.name ?? 'Error'}: ${err.message ?? ''}${err.code ? ` [${err.code}]` : ''}`)
        cur = err.cause
      }
      out.errorChain = chain
    }
  }

  // ② OpenAI 도달성 — 파이프라인에서 try 없이 최상위로 던지는 유일한 fetch 라 최유력 후보
  try {
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY ?? ''}` },
      signal: AbortSignal.timeout(15_000),
    })
    out.openai = { reachable: true, httpStatus: res.status }
  } catch (e) {
    const chain: string[] = []
    let cur: unknown = e
    for (let i = 0; cur && i < 5; i++) {
      const err = cur as { name?: string; message?: string; code?: string; cause?: unknown }
      chain.push(`${err.name ?? 'Error'}: ${err.message ?? ''}${err.code ? ` [${err.code}]` : ''}`)
      cur = err.cause
    }
    out.openai = { reachable: false, errorChain: chain }
  }

  // ③ CLOVA 대형 페이로드 — 실제 OCR 는 수 MB base64 를 싣는다. 작은 진단만 통과하고
  //    큰 본문 전송 중 끊기는 부류(fetch failed)를 배제하기 위해 ~3MB 로 재현한다.
  if (url) {
    try {
      const big = 'A'.repeat(3 * 1024 * 1024)
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-OCR-SECRET': secret },
        body: JSON.stringify({
          version: 'V2', requestId: 'diag-big', timestamp: Date.now(),
          images: [{ format: 'jpg', name: 'diag-big', data: big }],
        }),
        signal: AbortSignal.timeout(25_000),
      })
      out.clovaBig = { reachable: true, httpStatus: res.status, bodyHead: (await res.text()).slice(0, 80) }
    } catch (e) {
      const chain: string[] = []
      let cur: unknown = e
      for (let i = 0; cur && i < 5; i++) {
        const err = cur as { name?: string; message?: string; code?: string; cause?: unknown }
        chain.push(`${err.name ?? 'Error'}: ${err.message ?? ''}${err.code ? ` [${err.code}]` : ''}`)
        cur = err.cause
      }
      out.clovaBig = { reachable: false, errorChain: chain }
    }
  }

  return NextResponse.json(out)
}
