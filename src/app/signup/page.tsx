import { redirect } from 'next/navigation'

// 소셜 로그인 전환으로 별도 회원가입 페이지 불필요 → 로그인으로 통합
export default function SignupPage() {
  redirect('/login')
}
