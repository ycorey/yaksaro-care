import Link from 'next/link'
import { YCCard } from '@/components/yc/yc-card'
import type { AutoTask } from '@/lib/pharmacy-board'
import PharmacyTodoList, { type TodoItem } from './pharmacy-todo-list'

export type RefillSoon = { patientId: string; patientName: string; dDay: number; expiryLabel: string }
export type OverdueReq = { id: string; patientId: string; patientName: string; label: string }
export type RecentConn = { id: string; name: string; agoLabel: string }

function Block({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <YCCard radius="lg" className="p-4 space-y-2">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-bold text-yc-neutral900">{title}</h3>
        {typeof count === 'number' && count > 0 && (
          <span className="text-xs font-bold text-white bg-yc-green600 rounded-yc-sm px-2 py-0.5">{count}</span>
        )}
      </div>
      {children}
    </YCCard>
  )
}

// ?focus=로 목록의 해당 환자를 자동 펼침
const focus = (id: string) => `/pharmacy?focus=${id}`

export default function PharmacyStatusBoard({ autoTasks, todos, refillSoon, overdue, recent }: {
  autoTasks: AutoTask[]; todos: TodoItem[]; refillSoon: RefillSoon[]; overdue: OverdueReq[]; recent: RecentConn[]
}) {
  return (
    <div className="space-y-4">
      <Block title="오늘 할 일" count={autoTasks.length}>
        {autoTasks.length === 0 ? (
          <p className="text-sm text-yc-neutral400">자동으로 챙길 일이 없어요</p>
        ) : (
          <ul className="space-y-1">
            {autoTasks.map(t => (
              <li key={t.id}>
                <Link href={focus(t.patientId)} className="flex items-center gap-2 text-sm text-yc-neutral700 py-1 active:opacity-70">
                  <span className="w-1.5 h-1.5 rounded-full bg-yc-green600 flex-shrink-0" />
                  <span className="truncate">{t.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <div className="border-t border-yc-neutral100 pt-2">
          <PharmacyTodoList initial={todos} />
        </div>
      </Block>

      <Block title="리필 임박" count={refillSoon.length}>
        {refillSoon.length === 0 ? (
          <p className="text-sm text-yc-neutral400">임박한 리필이 없어요</p>
        ) : (
          <ul className="space-y-1">
            {refillSoon.map(r => (
              <li key={r.patientId}>
                <Link href={focus(r.patientId)} className="flex items-center justify-between gap-2 text-sm py-1 active:opacity-70">
                  <span className="text-yc-neutral700 truncate">{r.patientName}</span>
                  <span className="text-xs text-yc-neutral500 flex-shrink-0">{r.dDay === 0 ? '오늘' : `D-${r.dDay}`} · {r.expiryLabel}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Block>

      <Block title="처리 늦은 요청" count={overdue.length}>
        {overdue.length === 0 ? (
          <p className="text-sm text-yc-neutral400">지연된 요청이 없어요</p>
        ) : (
          <ul className="space-y-1">
            {overdue.map(o => (
              <li key={o.id}>
                <Link href={focus(o.patientId)} className="flex items-center gap-2 text-sm py-1 active:opacity-70">
                  <span className="w-1.5 h-1.5 rounded-full bg-yc-error flex-shrink-0" />
                  <span className="text-yc-neutral700 truncate">{o.patientName} · {o.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Block>

      <Block title="최근 연결된 단골" count={recent.length}>
        {recent.length === 0 ? (
          <p className="text-sm text-yc-neutral400">최근 연결이 없어요</p>
        ) : (
          <ul className="space-y-1">
            {recent.map(r => (
              <li key={r.id}>
                <Link href={focus(r.id)} className="flex items-center justify-between gap-2 text-sm py-1 active:opacity-70">
                  <span className="text-yc-neutral700 truncate">{r.name}</span>
                  <span className="text-xs text-yc-neutral500 flex-shrink-0">{r.agoLabel}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Block>
    </div>
  )
}
