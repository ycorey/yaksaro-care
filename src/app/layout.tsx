import type { Metadata, Viewport } from 'next'
import { Toaster } from '@/components/ui/sonner'
import BackGuard from '@/components/back-guard'
import './globals.css'

export const metadata: Metadata = {
  title: '약사로 케어',
  description: '처방약·OTC·건강기능식품을 한 곳에서 통합 관리하고 약물 상호작용을 확인하세요.',
  keywords: ['복약관리', '약물상호작용', 'DUR', '처방전', '건강기능식품'],
  authors: [{ name: '약사로 케어' }],
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#2563eb',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <link
          rel="stylesheet"
          as="style"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="font-pretendard antialiased text-gray-900" style={{ backgroundColor: '#EFEBE2' }}>
        <BackGuard />
        {children}
        <Toaster position="top-center" richColors />
      </body>
    </html>
  )
}
