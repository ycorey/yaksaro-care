// 라우트 전환 즉시 표시되는 로딩 UI — 탭 즉시 반응(서버 렌더 대기 동안 공백 방지).
import PageSpinner from '@/components/page-spinner'

export default function Loading() {
  return <PageSpinner />
}
