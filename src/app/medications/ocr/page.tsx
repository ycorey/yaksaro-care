import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import OcrUploader from './ocr-uploader'
import { BackButton } from '../back-button'

export default async function OcrPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // 단골약국 조회 (있으면 OcrUploader에 전달 → 조제약국 자동 선택)
  const { data: profile } = await supabase
    .from('profiles')
    .select('regular_pharmacy_id, pharmacies(name)')
    .eq('id', user.id)
    .single()

  type PharmRow = { name: string }
  const ph = profile?.pharmacies as unknown as PharmRow | null
  const regularPharmacy = profile?.regular_pharmacy_id && ph?.name
    ? { id: profile.regular_pharmacy_id as string, name: ph.name }
    : null

  return (
    <div className="space-y-6">
      <div className="pt-2">
        <div className="flex items-center gap-3 mb-3">
          <BackButton />
          <h1 className="font-display text-xl text-yc-neutral900">처방전 촬영</h1>
        </div>
        <p className="text-sm text-yc-neutral500">처방전을 찍으면 약 목록이 자동으로 추출됩니다.</p>
      </div>
      <OcrUploader regularPharmacy={regularPharmacy} />
    </div>
  )
}
