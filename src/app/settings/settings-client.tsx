'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { signOutAndPurge } from '@/lib/purge'
import {
  requestNotificationPermission,
  showLocalNotification,
} from '@/lib/notifications'
import { subscribeToPush, unsubscribeFromPush, pushSupported } from '@/lib/push-client'
import { Lock, Hospital, Bell, Check, X } from '@phosphor-icons/react'
import { MEAL_SLOTS } from '@/lib/meal-slots'
import PharmacyLink from './pharmacy-link'
import { FONT_SIZE_KEY, FONT_PX, type FontSize } from '@/lib/font-size'

// 키·픽셀은 SSOT(lib/font-size) — 루트 FOUC 스크립트·(main) 레이아웃 복원·로그아웃 보존이 같은 값을 쓴다
const FONT_SIZE_OPTIONS: { key: FontSize; label: string }[] = [
  { key: 'normal', label: '보통' },
  { key: 'large',  label: '크게' },
  { key: 'xlarge', label: '아주 크게' },
]

// 키·라벨 모두 SSOT(meal-slots)에서 파생 — cron이 profiles.alarm_times[meal]로 필터한다
const ALARM_TIMES = MEAL_SLOTS.map(s => ({ key: s.meal, label: `${s.label} 알림` }))

// 설정 서버 영속 (실패해도 localStorage 폴백이 있으므로 조용히 무시)
function persistSettings(patch: Record<string, unknown>) {
  fetch('/api/profile/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  }).catch(() => {})
}

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className="relative rounded-full flex-shrink-0 before:content-[''] before:absolute before:inset-x-0 before:-inset-y-2"
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
  pharmacistConsent,
  regularPharmacyName,
  hasB2BPharmacy,
  initialFontSize,
  initialAlarmEnabled,
  initialAlarmTimes,
}: {
  userName:      string | null
  userEmail:     string | null
  userRole:      string | null
  consentHealth: boolean
  pharmacistConsent:   boolean
  regularPharmacyName: string | null
  hasB2BPharmacy:      boolean
  initialFontSize:     FontSize
  initialAlarmEnabled: boolean
  initialAlarmTimes:   Record<string, boolean>
}) {
  const router = useRouter()

  // 단골 약사 열람 동의
  const [pharmConsent, setPharmConsent] = useState(pharmacistConsent)
  const [pharmBusy, setPharmBusy]       = useState(false)

  async function togglePharmacistConsent() {
    if (!regularPharmacyName || pharmBusy) return
    const next = !pharmConsent
    setPharmBusy(true)
    setPharmConsent(next) // 낙관적
    try {
      const res = await fetch('/api/profile/pharmacist-consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      })
      if (!res.ok) throw new Error()
      toast.success(next ? '단골 약사에게 공개로 설정했어요' : '공개를 해제했어요')
    } catch {
      setPharmConsent(!next) // 롤백
      toast.error('변경에 실패했어요')
    } finally {
      setPharmBusy(false)
    }
  }

  // 글자 크기 — 서버(profiles)가 진실원, localStorage는 FOUC 방지 캐시
  const [fontSize, setFontSize] = useState<FontSize>(initialFontSize)
  const [deleteOpen,    setDeleteOpen]    = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [deleting,      setDeleting]      = useState(false)

  // 알림 — 서버(profiles)가 진실원, cron이 이 값으로 발송 대상을 거른다
  const [alarmEnabled, setAlarmEnabled]   = useState(initialAlarmEnabled)
  const [alarmTimes, setAlarmTimes]       = useState<Record<string, boolean>>({
    morning: true, afternoon: true, evening: true, bedtime: true,
    ...initialAlarmTimes,
  })

  function applyFontSize(fs: FontSize) {
    document.documentElement.style.fontSize = `${FONT_PX[fs]}px`
  }

  // 서버 값을 화면·localStorage 캐시에 동기화 (기기 변경 시 복원)
  useEffect(() => {
    applyFontSize(initialFontSize)
    try {
      localStorage.setItem(FONT_SIZE_KEY, initialFontSize)
      localStorage.setItem('yaksaro_alarm_enabled', initialAlarmEnabled ? '1' : '0')
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function changeFontSize(fs: FontSize) {
    setFontSize(fs)
    applyFontSize(fs)
    try { localStorage.setItem(FONT_SIZE_KEY, fs) } catch {}
    persistSettings({ font_size: fs })
  }

  async function toggleAlarm() {
    const next = !alarmEnabled

    if (next) {
      // 1) 알림 권한 요청
      const perm = await requestNotificationPermission()
      if (perm === 'unsupported') { toast.error('이 브라우저는 알림을 지원하지 않아요'); return }
      if (perm === 'denied') { toast.error('알림이 차단되어 있어요. 브라우저 설정에서 허용해주세요'); return }

      // 2) 웹 푸시 구독(서버 등록) → 앱이 꺼져 있어도 예약 알림 수신
      let pushed = false
      if (pushSupported()) {
        const ok = await subscribeToPush()
        if (ok) {
          // 실제 푸시 경로로 확인 알림 (서버→푸시서비스→기기)
          const res = await fetch('/api/push/test', { method: 'POST' }).then(r => r.json()).catch(() => null)
          pushed = !!res?.sent
        }
      }
      // 3) 푸시가 안 되면 로컬 알림으로라도 확인
      if (!pushed) {
        await showLocalNotification('약사로케어 알림이 켜졌어요', {
          body: '약 드실 시간에 알려드릴게요.',
          url: '/today',
        })
      }
      toast.success(pushed ? '복약 알림이 켜졌어요' : '알림이 켜졌어요 (이 기기)')
    } else {
      // 끌 때: 푸시 구독 해제
      await unsubscribeFromPush().catch(() => {})
    }

    setAlarmEnabled(next)
    try { localStorage.setItem('yaksaro_alarm_enabled', next ? '1' : '0') } catch {}
    persistSettings({ alarm_enabled: next })
  }

  function toggleAlarmTime(key: string) {
    const next = { ...alarmTimes, [key]: !alarmTimes[key] }
    setAlarmTimes(next)
    try { localStorage.setItem('yaksaro_alarm_times', JSON.stringify(next)) } catch {}
    persistSettings({ alarm_times: next })
  }

  async function handleDeleteAccount() {
    if (deleteConfirm.trim() !== '탈퇴' || deleting) return
    setDeleting(true)
    try {
      const res = await fetch('/api/profile/delete', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(typeof data?.error === 'string' ? data.error : '탈퇴 처리에 실패했어요')
        setDeleting(false)
        return
      }
      // 서버에서 계정이 사라졌으므로 로컬 흔적도 함께 지운다(푸시 해제 포함).
      // 계정이 없어 signOut 이 실패해도 로컬 파기는 진행돼야 하므로 개별 처리한다.
      await signOutAndPurge().catch(() => {})
      // 계정 자체가 사라진 상태다. 소프트 이동은 죽은 세션을 든 React 트리를 그대로 들고 가
      // 프록시·슬롯이 잔여 상태로 렌더될 수 있으므로 문서를 새로 연다.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- 탈퇴 직후 상태 초기화를 위한 의도된 하드 내비게이션
      window.location.href = '/login?deleted=1'
    } catch {
      toast.error('탈퇴 처리에 실패했어요')
      setDeleting(false)
    }
  }

  async function handleLogout() {
    await signOutAndPurge()
    router.push('/login')
    router.refresh()
  }

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 pb-8">

      {/* ── 글자 크기 ── */}
      <section className="anim-page" style={{ animationDelay: '0ms' }}>
        <p className="text-sm font-semibold text-yc-neutral600 mb-3">글자 크기</p>
        <div className="flex gap-2">
          {FONT_SIZE_OPTIONS.map(f => (
            <button key={f.key} type="button" onClick={() => changeFontSize(f.key)}
              className={`flex-1 py-3.5 rounded-yc-lg text-sm transition-colors shadow-[var(--yc-shadow-sm)] ${
                fontSize === f.key
                  ? 'bg-yc-green600 text-white font-semibold'
                  : 'bg-white text-yc-neutral700 font-semibold active:bg-yc-neutral50'
              }`}>
              {f.label}
            </button>
          ))}
        </div>
      </section>

      {/* ── 복약 알림 ── */}
      <section className="anim-page" style={{ animationDelay: '50ms' }}>
        <p className="text-sm font-semibold text-yc-neutral600 mb-3">복약 알림</p>
        <div className="bg-white rounded-yc-lg px-5 shadow-[var(--yc-shadow-sm)]">
          <Row>
            <div className="flex items-center gap-3">
              <Bell weight="fill" size={22} className="text-yc-neutral400 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-yc-neutral900">복약 시간 알림</p>
                <p className="text-sm text-yc-neutral500 mt-0.5">약 드실 시간에 알려드려요</p>
              </div>
            </div>
            <Toggle on={alarmEnabled} onToggle={toggleAlarm} />
          </Row>
        </div>
        <p className="text-sm text-yc-neutral500 mt-2 flex items-start gap-1">
          <span className="flex-shrink-0 mt-0.5">ⓘ</span>
          홈 화면에 앱을 추가하면 알림이 더 잘 도착해요.
        </p>
      </section>

      {/* ── 시간대별 알림 ── */}
      <section className="anim-page" style={{ animationDelay: '100ms' }}>
        <p className="text-sm font-semibold text-yc-neutral600 mb-3">시간대별 알림</p>
        <div className={`bg-white rounded-yc-lg px-5 shadow-[var(--yc-shadow-sm)] transition-opacity ${!alarmEnabled ? 'opacity-50' : ''}`}>
          {ALARM_TIMES.map(({ key, label }) => (
            <Row key={key}>
              <span className="text-sm font-medium text-yc-neutral900">{label}</span>
              <Toggle on={alarmEnabled && !!alarmTimes[key]} onToggle={() => toggleAlarmTime(key)} />
            </Row>
          ))}
        </div>
        {!alarmEnabled ? (
          <p className="text-sm text-yc-warningText mt-2 flex items-start gap-1">
            <span className="flex-shrink-0 mt-0.5">ⓘ</span>
            위 <span className="font-semibold">복약 시간 알림</span>을 먼저 켜면 끼니별로 조절할 수 있어요.
          </p>
        ) : (
          <p className="text-sm text-yc-neutral500 mt-2 flex items-start gap-1">
            <Lock weight="fill" size={14} className="text-yc-neutral400 flex-shrink-0 mt-0.5" />
            알림은 이 휴대폰에서만 동작하고, 약 정보는 다른 곳으로 보내지 않아요.
          </p>
        )}
      </section>

      {/* ── 단골 약사에게 공개 ── */}
      <section className="anim-page" style={{ animationDelay: '150ms' }}>
        <p className="text-sm font-semibold text-yc-neutral600 mb-3">단골 약국</p>
        <PharmacyLink initialName={regularPharmacyName} />

        {/* 약사 열람 동의는 QR로 연결된 B2B 약국에만 의미가 있음 */}
        {hasB2BPharmacy && (
          <>
            <div className="bg-white rounded-yc-lg px-5 shadow-[var(--yc-shadow-sm)] mt-3">
              <Row>
                <div className="flex items-center gap-3 min-w-0">
                  <Hospital weight="fill" size={22} className="text-yc-neutral400 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-yc-neutral900">단골 약사에게 내 약 목록 공개</p>
                    <p className="text-xs text-yc-neutral500 mt-0.5 truncate">
                      {regularPharmacyName} 약사가 읽기 전용으로 볼 수 있어요
                    </p>
                  </div>
                </div>
                <Toggle on={pharmConsent} onToggle={togglePharmacistConsent} />
              </Row>
            </div>
            <p className="text-xs text-yc-neutral500 mt-2 flex items-start gap-1">
              <span className="flex-shrink-0 mt-0.5">ⓘ</span>
              켜면 단골 약사가 복약 상담에 참고할 수 있어요. 언제든 끄면 즉시 볼 수 없게 돼요.
            </p>
          </>
        )}
      </section>

      {/* ── 내 정보 ── */}
      <section className="anim-page" style={{ animationDelay: '200ms' }}>
        <p className="text-sm font-semibold text-yc-neutral600 mb-3">내 정보</p>
        <div className="bg-white rounded-yc-lg shadow-[var(--yc-shadow-sm)] overflow-hidden">
          <div className="px-5 py-4 border-b border-yc-neutral100">
            <p className="text-xs text-yc-neutral500 mb-0.5">이름</p>
            <p className="text-sm font-semibold text-yc-neutral900">{userName ?? '—'}</p>
          </div>
          <div className="px-5 py-4 border-b border-yc-neutral100">
            <p className="text-xs text-yc-neutral500 mb-0.5">이메일</p>
            <p className="text-sm font-semibold text-yc-neutral900">{userEmail ?? '—'}</p>
          </div>
          <div className="px-5 py-4 border-b border-yc-neutral100">
            <p className="text-xs text-yc-neutral500 mb-0.5">역할</p>
            <p className="text-sm font-semibold text-yc-neutral900">
              {userRole === 'pharmacist' ? '약사' : '환자·보호자'}
            </p>
          </div>
          <div className="px-5 py-4">
            <div className="flex items-center gap-2 text-sm">
              <span className={consentHealth ? 'text-yc-green600' : 'text-yc-error'}>
                {consentHealth ? <Check weight="bold" size={14} /> : <X weight="bold" size={14} />}
              </span>
              <span className="text-yc-neutral700">건강정보 수집·이용 동의</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── 계정 ── */}
      <section className="anim-page" style={{ animationDelay: '250ms' }}>
        <p className="text-sm font-semibold text-yc-neutral600 mb-3">계정</p>
        <div className="bg-white rounded-yc-lg shadow-[var(--yc-shadow-sm)] overflow-hidden">
          {/* 위험 색은 되돌릴 수 없는 쪽에만 쓴다 — 반대로 칠해져 있었더니(로그아웃 빨강 /
              회원 탈퇴 회색) 색만 보고 누르면 정확히 반대로 갔다. */}
          <button onClick={handleLogout}
            className="w-full px-5 py-4 text-left text-sm font-medium text-yc-neutral700 active:bg-yc-neutral100 transition-colors min-h-[52px]">
            로그아웃
          </button>
          {/* 약사 계정은 셀프 탈퇴 불가 — CASCADE 로 약국·QR·요청 이력까지 함께 사라진다(API 도 403) */}
          {userRole !== 'pharmacist' && (
            <button onClick={() => setDeleteOpen(true)}
              className="w-full px-5 py-4 text-left text-sm font-medium text-yc-error border-t border-yc-neutral200 active:bg-yc-errorBg transition-colors min-h-[52px]">
              회원 탈퇴
            </button>
          )}
        </div>
        <p className="text-xs text-yc-neutral500 mt-3 text-center leading-relaxed">
          개인정보 열람·정정 요청은 admin@yaksaro.co.kr 으로 문의하세요.
        </p>
      </section>

      {/* 탈퇴 확인 — 되돌릴 수 없으므로 '탈퇴'를 직접 입력해야 진행된다(오탭 방지) */}
      {deleteOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4"
             role="dialog" aria-modal="true" aria-labelledby="yc-del-title">
          <div className="bg-white rounded-yc-lg w-full max-w-md p-6 shadow-lg">
            <h2 id="yc-del-title" className="text-lg font-bold text-yc-neutral900">정말 탈퇴하시겠어요?</h2>
            <p className="text-sm text-yc-neutral600 mt-3 leading-relaxed">
              등록한 약, 복약 기록, 가족 정보가 <b>모두 삭제되고 되돌릴 수 없어요.</b>
              {' '}알림도 더 이상 오지 않아요.
            </p>
            <label htmlFor="yc-del-confirm" className="block text-sm text-yc-neutral700 mt-4">
              계속하시려면 아래에 <b>탈퇴</b> 라고 입력해주세요.
            </label>
            <input
              id="yc-del-confirm"
              value={deleteConfirm}
              onChange={e => setDeleteConfirm(e.target.value)}
              autoComplete="off"
              className="w-full mt-2 px-4 py-3 text-base border border-yc-neutral300 rounded-yc-md focus:outline-none focus:border-yc-green600"
            />
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => { setDeleteOpen(false); setDeleteConfirm('') }}
                disabled={deleting}
                className="flex-1 py-3 text-base font-semibold text-yc-neutral700 bg-yc-neutral100 rounded-yc-md min-h-[52px]">
                취소
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleteConfirm.trim() !== '탈퇴' || deleting}
                className="flex-1 py-3 text-base font-semibold text-white bg-yc-error rounded-yc-md min-h-[52px] disabled:opacity-40">
                {deleting ? '처리 중…' : '탈퇴하기'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
