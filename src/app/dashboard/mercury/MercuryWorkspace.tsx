'use client'

import { useState } from 'react'
import s from './MercuryTabs.module.css'
import LinkedInMessagesTab from './LinkedInMessagesTab'
import QuickRepliesTab from './QuickRepliesTab'
import EmailFunnelTab from './EmailFunnelTab'

type MercuryTab = 'linkedin' | 'quick_replies' | 'email_funnel'

const TABS: { id: MercuryTab; label: string }[] = [
  { id: 'linkedin', label: 'LinkedIn Messages' },
  { id: 'quick_replies', label: 'Quick Replies' },
  { id: 'email_funnel', label: 'Email Funnel' },
]

export default function MercuryWorkspace() {
  const [active, setActive] = useState<MercuryTab>('linkedin')

  return (
    <div>
      <div className={s.tabRow}>
        {TABS.map(t => (
          <button
            key={t.id}
            className={`${s.tabBtn} ${active === t.id ? s.tabBtnActive : ''}`}
            onClick={() => setActive(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className={active === 'linkedin' ? '' : s.hidden}><LinkedInMessagesTab /></div>
      <div className={active === 'quick_replies' ? '' : s.hidden}><QuickRepliesTab /></div>
      <div className={active === 'email_funnel' ? '' : s.hidden}><EmailFunnelTab /></div>
    </div>
  )
}
