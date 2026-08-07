import webpush from 'web-push'
import { createAdminClient } from '@/lib/supabase/admin'

const VAPID_READY = !!(
  process.env.VAPID_SUBJECT &&
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
  process.env.VAPID_PRIVATE_KEY
)

if (VAPID_READY) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  )
}

export interface PushPayload {
  title: string
  body: string
  url?: string
}

/**
 * 특정 사용자에게 웹 푸시 전송. service_role(admin)로 구독을 조회하므로
 * 쿠키 없는 컨텍스트(cron 등)에서도 동작한다. 만료(410/404) 구독은 정리.
 * @returns 전송 성공 건수
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<number> {
  if (!VAPID_READY) return 0

  const admin = createAdminClient()
  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', userId)

  if (!subs || subs.length === 0) return 0

  const message = JSON.stringify(payload)
  const stale: string[] = []

  const results = await Promise.allSettled(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          message,
        )
      } catch (e: unknown) {
        const code = (e as { statusCode?: number })?.statusCode
        if (code === 404 || code === 410) stale.push(s.endpoint) // 만료 구독
        throw e
      }
    }),
  )

  // 만료 구독 정리 — 반드시 이 사용자 스코프로 지운다.
  // user_id 없이 endpoint 로만 지우면, 같은 endpoint 를 쓰는 다른 사용자의 구독까지
  // 함께 날아가 그 사람이 복약 알림을 못 받게 된다.
  if (stale.length) {
    try {
      await admin.from('push_subscriptions').delete().eq('user_id', userId).in('endpoint', stale)
    } catch { /* 정리 실패는 전송 결과에 영향 없음 */ }
  }

  return results.filter((r) => r.status === 'fulfilled').length
}
