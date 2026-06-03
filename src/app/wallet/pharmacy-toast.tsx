'use client'

import { useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'

export default function PharmacyToast() {
  const params = useSearchParams()
  const router = useRouter()

  useEffect(() => {
    if (params.get('pharmacy_linked') === '1') {
      const name = params.get('pharmacy_name')
      toast.success(name ? `${name}과 연결되었습니다` : '단골 약국이 등록되었습니다')
      router.replace('/wallet')
    }
  }, [params, router])

  return null
}
