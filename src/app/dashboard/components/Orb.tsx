'use client'

import { useRef } from 'react'
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
  idle: <><b className={s.orbStateAccent}>Idle</b> · tap the orb to speak</>,
  listening: <b className={s.orbStateAccent}>Listening…</b>,
  thinking: <b className={s.orbStateAccent}>Thinking…</b>,
  speaking: <b className={s.orbStateAccent}>MAIA speaking…</b>,
}

export default function Orb({ state, onChange }: Props) {
  const t1 = useRef<ReturnType<typeof setTimeout> | null>(null)
  const t2 = useRef<ReturnType<typeof setTimeout> | null>(null)

  function startListen() {
    onChange('listening')
  }

  function respond() {
    onChange('thinking')
    if (t1.current) clearTimeout(t1.current)
    if (t2.current) clearTimeout(t2.current)
    t1.current = setTimeout(() => onChange('speaking'), 1400)
    t2.current = setTimeout(() => onChange('idle'), 5600)
  }

  function handleOrbClick() {
    if (state === 'listening') respond()
    else startListen()
  }

  return (
    <>
      <div
        className={`${s.orbWrap} ${STATE_CLASS[state]}`}
        onClick={handleOrbClick}
        title="Tap to talk to MAIA"
        role="button"
        aria-label={`Orb — ${state}. Click to ${state === 'listening' ? 'send' : 'speak'}`}
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
