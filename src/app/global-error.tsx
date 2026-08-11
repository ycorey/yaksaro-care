'use client'

import { useEffect } from 'react'
import { logger } from '@/lib/logger'
import './globals.css'

// 루트 레이아웃 자체가 실패했을 때의 마지막 그물. 레이아웃이 죽었으므로 <html>·<body> 를
// 직접 세워야 하고, 이 파일은 다른 어떤 레이아웃 코드에도 기대면 안 된다.
//
// 그래서 여기서는 공용 컴포넌트(FailureScreen) 를 쓰지 않고 최소 마크업만 쓴다 —
// 그 컴포넌트가 의존하는 무언가가 이미 깨져 있을 수 있다. 마지막 그물은 스스로 서야 한다.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    logger.error('ui', '전역 렌더 실패', error)
  }, [error])

  return (
    <html lang="ko">
      <body style={{ margin: 0, background: '#EFEBE2', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{
          minHeight: '100vh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', padding: '0 2rem',
          textAlign: 'center', gap: '1rem', color: '#1A1A1A',
        }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>
            앱을 불러오지 못했어요
          </h1>
          <p style={{ fontSize: '1rem', color: '#6B6B6B', lineHeight: 1.6, margin: 0 }}>
            잠시 후 다시 시도해보세요.<br />계속 이 화면이 나오면 문의해주세요.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '100%', maxWidth: '20rem', marginTop: '0.5rem' }}>
            <button
              type="button"
              onClick={reset}
              style={{
                height: 48, borderRadius: 12, border: 'none', background: '#0E6E54',
                color: '#fff', fontSize: '1rem', fontWeight: 600, cursor: 'pointer',
              }}
            >
              다시 시도
            </button>
            {/* 세션이 꼬여 루트가 죽는 경우가 있어, 로그인 화면으로 빠져나갈 길을 함께 둔다. */}
            <a
              href="/login"
              style={{
                height: 48, borderRadius: 12, background: '#fff', color: '#3D3D3D',
                border: '1px solid #E0DCD3', fontSize: '1rem', fontWeight: 600,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                textDecoration: 'none',
              }}
            >
              로그인 화면으로
            </a>
          </div>
          {error.digest ? (
            <p style={{ marginTop: '1rem', fontSize: '0.75rem', color: '#9A9A9A' }}>
              오류 코드 {error.digest}
            </p>
          ) : null}
        </div>
      </body>
    </html>
  )
}
