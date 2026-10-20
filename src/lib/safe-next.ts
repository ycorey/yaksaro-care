// 로그인·동의 후 돌아갈 `next` 경로가 **우리 사이트 안**인지 판정한다(오픈 리다이렉트 방지).
//
// 왜 문자열 검사(`startsWith('/') && !startsWith('//')`)로 부족한가: 브라우저 URL 파서는
// `\` 를 `/` 로, 탭·개행은 지워서 읽는다. `/\evil.com` 이나 `/<탭>/evil.com` 은 문자열로는
// `//` 가 아니지만 브라우저에선 `//evil.com` — 외부 호스트다. 2026-10-19 평가가 지목한
// 4곳(auth/callback·consent 2·login)이 모두 그 검사를 복사해 쓰고 있었다.
//
// 그래서 브라우저와 같은 파서(WHATWG URL)에 맡기고, 결과의 origin 이 바뀌었는지만 본다.

const BASE = 'http://internal.invalid'

export function safeNextPath(raw: string | null | undefined): string | null {
  if (!raw || !raw.startsWith('/')) return null
  let url: URL
  try {
    url = new URL(raw, BASE)
  } catch {
    return null
  }
  if (url.origin !== BASE) return null
  return url.pathname + url.search + url.hash
}
