'use client'

import { useState } from 'react'
import type { OrbState } from '../types'
import s from '../dashboard.module.css'

interface Props {
  orbState: OrbState
  onOrbChange: (state: OrbState) => void
}

export default function Composer({ orbState, onOrbChange }: Props) {
  const [value, setValue] = useState('')
  const micActive = orbState === 'listening'

  function handleMic() {
    if (micActive) onOrbChange('thinking')
    else onOrbChange('listening')
  }

  return (
    <div className={s.composer}>
      <div className={s.composerInner}>
        <input
          className={s.composerInput}
          placeholder="Ask MAIA, or tap the mic…"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <button
          className={`${s.mic} ${micActive ? s.active : ''}`}
          onClick={handleMic}
          aria-label="Voice input"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
            <path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v3" />
          </svg>
        </button>
      </div>
    </div>
  )
}
