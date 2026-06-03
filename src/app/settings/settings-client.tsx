'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type FontSize = 'normal' | 'large' | 'xlarge'

const FONT_SIZES: { key: FontSize; label: string; px: number }[] = [
  { key: 'normal', label: '보통',    px: 16 },
  { key: 'large',  label: '크게',    px: 18 },
  { key: 'xlarge', label: '아주 크게', px: 20 },
]

const ALARM_TIMES = [
  { key: 'morning',   label: '아침 알림' },
  { key: 'afternoon', label: '점심 알림' },
  { key: 'evening',   label: '저녁 알림' },
  { key: 'night',     label: '취침 알림' },
]

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className="relative rounded-full flex-shrink-0"
      style={{
        width: 48,
        height: 28,
        backgroundColor: on ? 'var(--color-yc-green600)' : 'var(--color-yc-neutral300)',
        transition: 'background-color 0.2s',
      }}
    >
      <span
        className="absolute rounded-full bg-white shadow"
        style={{
          width: 24,
          height: 24,
          top: 2,
          left: on ? 22 : 2,
          transition: 'left 0.2s',
        }}
      />
    </button>
  )
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-4 border-b border-yc-neutral100 last:border-0">
      {children}
    </div>
  )
}

export default function SettingsClient({
  userName,
  userEmail,
  userRole,
  consentHealth,
}: {
  userName:      string | null
  userEmail:     string | null
  userRole:      string | null
  consentHealth: boolean
}) {
  const router = useRouter()

  // 글자 크기
  const [fontSize, setFontSize] = useState<FontSize>('normal')

  // 알림
  const [alarmEnabled, setAlarmEnabled]   = useState(true)
  const [alarmTimes, setAlarmTimes]       = useState<Record<string, boolean>>({
    morning: true, afternoon: true, evening: true, night: true,
  })

  // localStorage에서 설정 복원
  useEffect(() => {
    try {
      const fs = localStorage.getItem('yaksaro_font_size') as FontSize | null
      if (fs) { setFontSize(fs); applyFontSize(fs) }
      const ae = localStorage.getItem('yaksaro_alarm_enabled')
      if (ae !== null) setAlarmEnabled(ae === '1')
      const at = localStorage.getItem('yaksaro_alarm_times')
      if (at) setAlarmTimes(JSON.parse(at))
    } catch {}
  }, [])

  function applyFontSize(fs: FontSize) {
    const px = FONT_SIZES.find(f => f.key === fs)?.px ?? 16
    document.documentElement.style.fontSize = `${px}px`
  }

  function changeFontSize(fs: FontSize) {
    setFontSize(fs)
    applyFontSize(fs)
    try { localStorage.setItem('yaksaro_font_size', fs) } catch {}
  }

  function toggleAlarm() {
    const next = !alarmEnabled
    setAlarmEnabled(next)
    try { localStorage.setItem('yaksaro_alarm_enabled', next ? '1' : '0') } catch {}
  }

  function toggleAlarmTime(key: string) {
    const next = { ...alarmTimes, [key]: !alarmTimes[key] }
    setAlarmTimes(next)
    try { localStorage.setItem('yaksaro_alarm_times', JSON.stringify(next)) } catch {}
  }

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    try { localStorage.clear() } catch {}
    try { document.cookie = 'pending_pharmacy_id=; Max-Age=0; path=/' } catch {}
    router.push('/login')
    router.refresh()
  }

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 pb-8">

      {/* ── 글자 크기 ── */}
      <section>
        <p className="text-sm font-semibold text-yc-neutral600 mb-3">글자 크기</p>
        <div className="flex gap-2">
          {FONT_SIZES.map(f => (
            <button key={f.key} type="button" onClick={() => changeFontSize(f.key)}
              className={`flex-1 py-3.5 rounded-yc-lg text-sm transition-colors shadow-[var(--yc-shadow-sm)] ${
                fontSize === f.key
                  ? 'bg-yc-green600 text-white font-display'
                  : 'bg-white text-yc-neutral700 font-semibold active:bg-yc-neutral50'
              }`}>
              {f.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-yc-neutral400 mt-2 flex items-start gap-1">
          <span className="flex-shrink-0 mt-0.5">ⓘ</span>
          눈이 편한 크기로 골라보세요. 앱 전체 글자가 함께 커져요.
        </p>
      </section>

      {/* ── 복약 알림 ── */}
      <section>
        <p className="text-sm font-semibold text-yc-neutral600 mb-3">복약 알림</p>
        <div className="bg-white rounded-yc-lg px-5 shadow-[var(--yc-shadow-sm)]">
          <Row>
            <div className="flex items-center gap-3">
              <span className="text-xl">🕐</span>
              <div>
                <p className="text-sm font-semibold text-yc-neutral900">복약 시간 알림</p>
                <p className="text-xs text-yc-neutral400 mt-0.5">약 드실 시간에 알려드려요</p>
              </div>
            </div>
            <Toggle on={alarmEnabled} onToggle={toggleAlarm} />
          </Row>
        </div>
      </section>

      {/* ── 시간대별 알림 ── */}
      <section>
        <p className="text-sm font-semibold text-yc-neutral600 mb-3">시간대별 알림</p>
        <div className="bg-white rounded-yc-lg px-5 shadow-[var(--yc-shadow-sm)]">
          {ALARM_TIMES.map(({ key, label }) => (
            <Row key={key}>
              <span className="text-sm font-medium text-yc-neutral900">{label}</span>
              <Toggle on={alarmEnabled && !!alarmTimes[key]} onToggle={() => toggleAlarmTime(key)} />
            </Row>
          ))}
        </div>
        <p className="text-xs text-yc-neutral400 mt-2 flex items-start gap-1">
          <span className="flex-shrink-0 mt-0.5">ⓘ</span>
          꺼진 시간대는 알림이 오지 않아요.
        </p>
        <p className="text-xs text-yc-neutral400 mt-1.5 flex items-start gap-1">
          <span className="flex-shrink-0 mt-0.5">🔒</span>
          알림은 이 휴대폰에서만 동작하고, 약 정보는 다른 곳으로 보내지 않아요.
        </p>
      </section>

      {/* ── 내 정보 ── */}
      <section>
        <p className="text-sm font-semibold text-yc-neutral600 mb-3">내 정보</p>
        <div className="bg-white rounded-yc-lg shadow-[var(--yc-shadow-sm)] overflow-hidden">
          <div className="px-5 py-4 border-b border-yc-neutral100">
            <p className="text-xs text-yc-neutral400 mb-0.5">이름</p>
            <p className="text-sm font-semibold text-yc-neutral900">{userName ?? '—'}</p>
          </div>
          <div className="px-5 py-4 border-b border-yc-neutral100">
            <p className="text-xs text-yc-neutral400 mb-0.5">이메일</p>
            <p className="text-sm font-semibold text-yc-neutral900">{userEmail ?? '—'}</p>
          </div>
          <div className="px-5 py-4 border-b border-yc-neutral100">
            <p className="text-xs text-yc-neutral400 mb-0.5">역할</p>
            <p className="text-sm font-semibold text-yc-neutral900">
              {userRole === 'pharmacist' ? '약사' : '환자·보호자'}
            </p>
          </div>
          <div className="px-5 py-4">
            <div className="flex items-center gap-2 text-sm">
              <span className={consentHealth ? 'text-yc-green600' : 'text-yc-error'}>
                {consentHealth ? '✓' : '✗'}
              </span>
              <span className="text-yc-neutral700">건강정보 수집·이용 동의</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── 계정 ── */}
      <section>
        <p className="text-sm font-semibold text-yc-neutral600 mb-3">계정</p>
        <div className="bg-white rounded-yc-lg shadow-[var(--yc-shadow-sm)] overflow-hidden">
          <button onClick={handleLogout}
            className="w-full px-5 py-4 text-left text-sm font-medium text-yc-error active:bg-yc-errorBg transition-colors">
            로그아웃
          </button>
        </div>
        <p className="text-xs text-yc-neutral400 mt-3 text-center leading-relaxed">
          계정 삭제·개인정보 열람 요청은 ycorey@gmail.com 으로 문의하세요.
        </p>
      </section>

    </div>
  )
}
