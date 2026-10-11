'use client'

import s from './MercuryTabs.module.css'

export default function EmailFunnelTab() {
  return (
    <div className={s.placeholderCard}>
      <div className={s.placeholderIcon}>📬</div>
      <div className={s.placeholderTitle}>Email Funnel</div>
      <p className={s.placeholderText}>
        The 6-touch email sequence tracker is coming soon. It will manage Archie&apos;s full
        prospecting funnel — scheduling, drafting, and logging every touch point.
      </p>
      <p className={s.placeholderText}>Check back once the outreach guides are finalised.</p>
    </div>
  )
}
