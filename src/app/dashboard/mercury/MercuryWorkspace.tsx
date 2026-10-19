'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
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

function isMercuryTab(v: string | null): v is MercuryTab {
  return v === 'linkedin' || v === 'quick_replies' || v === 'email_funnel'
}

export default function MercuryWorkspace() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const urlTab = searchParams.get('tab')
  const [active, setActive] = useState<MercuryTab>(isMercuryTab(urlTab) ? urlTab : 'linkedin')

  // Keeps ?tab= in sync with the active tab (replace, not push, so switching
  // tabs doesn't pile up browser-history entries) — a refresh or a slow load
  // then lands back on the same tab instead of resetting to LinkedIn Messages.
  useEffect(() => {
    if (searchParams.get('tab') === active) return
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', active)
    router.replace(`?${params.toString()}`, { scroll: false })
  }, [active, router, searchParams])

  return (
    <div className={s.root}>
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

      <div className={`${s.tabContent} ${active === 'linkedin' ? '' : s.hidden}`}><LinkedInMessagesTab /></div>
      <div className={`${s.tabContent} ${active === 'quick_replies' ? '' : s.hidden}`}><QuickRepliesTab /></div>
      <div className={`${s.tabContent} ${active === 'email_funnel' ? '' : s.hidden}`}><EmailFunnelTab /></div>
    </div>
  )
}
