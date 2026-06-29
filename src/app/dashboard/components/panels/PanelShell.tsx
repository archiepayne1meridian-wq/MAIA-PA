'use client'

import s from '../../dashboard.module.css'

export function PanelSkeleton() {
  return (
    <div className={s.panelSkeleton}>
      <div className={s.skeletonLine} style={{ width: '60%', height: 12, marginBottom: 10 }} />
      <div className={s.skeletonLine} style={{ width: '90%', height: 10, marginBottom: 7 }} />
      <div className={s.skeletonLine} style={{ width: '75%', height: 10, marginBottom: 7 }} />
      <div className={s.skeletonLine} style={{ width: '85%', height: 10, marginBottom: 20 }} />
      <div className={s.skeletonLine} style={{ width: '60%', height: 12, marginBottom: 10 }} />
      <div className={s.skeletonLine} style={{ width: '95%', height: 10, marginBottom: 7 }} />
      <div className={s.skeletonLine} style={{ width: '80%', height: 10 }} />
    </div>
  )
}

export function PanelError({ message }: { message: string }) {
  return (
    <div className={s.panelError}>
      <span className={s.panelErrorIcon}>⚠</span>
      <span>{message}</span>
    </div>
  )
}
