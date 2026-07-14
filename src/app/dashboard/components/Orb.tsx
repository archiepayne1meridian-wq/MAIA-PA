'use client'

import type { OrbState } from '../types'
import s from '../dashboard.module.css'

interface Props {
  state: OrbState
  onChange: (state: OrbState) => void
}

const STATE_CLASS: Record<OrbState, string> = {
  idle: '',
  listening: s.isListening,
  thinking: s.isThinking,
  speaking: s.isSpeaking,
}

const STATE_LABEL: Record<OrbState, React.ReactNode> = {
  idle: <><b className={s.orbStateAccent}>Idle</b> · tap the orb or mic to speak</>,
  listening: <b className={s.orbStateAccent}>Listening…</b>,
  thinking: <b className={s.orbStateAccent}>Thinking…</b>,
  speaking: <b className={s.orbStateAccent}>MAIA speaking…</b>,
}

export default function Orb({ state, onChange }: Props) {
  function handleOrbClick() {
    if (state === 'idle') onChange('listening')
    else if (state === 'listening') onChange('idle')
    // ignore clicks while thinking or speaking
  }

  return (
    <>
      <div
        className={`${s.orbWrap} ${STATE_CLASS[state]}`}
        onClick={handleOrbClick}
        title="Tap to talk to MAIA"
        role="button"
        aria-label={`Orb — ${state}. ${state === 'idle' ? 'Click to speak' : state === 'listening' ? 'Click to cancel' : ''}`}
      >
        <div className={s.orbGlow} />
        <div className={`${s.orbRing} ${s.r2}`} />
        <div className={s.orbRing} />
        <div className={s.pulse} />
        <div className={s.pulse} />
        <div className={s.orb} />
        <div className={s.sat} />
      </div>
      <div className={s.orbState}>{STATE_LABEL[state]}</div>
    </>
  )
}
