import { redirect } from 'next/navigation'
// 캘린더는 '오늘 복약' 화면으로 통합됨 — 기존 링크·북마크·PWA 접근은 /today로 보낸다.
export default function Page() { redirect('/today') }
