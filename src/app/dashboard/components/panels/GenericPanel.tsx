'use client'

import type { Agent } from '../../types'
import s from '../../dashboard.module.css'

interface Props {
  agent: Agent
}

export default function GenericPanel({ agent }: Props) {
  if (agent.inactive) {
    return (
      <div className={s.panelInactive}>
        <div className={s.panelInactiveBadge}>{agent.badge}</div>
        <div className={s.panelInactiveTitle}>{agent.id}</div>
        <div className={s.panelInactiveMsg}>
          This agent is not yet active.
          <br />
          {agent.feed[0]?.[1] ?? 'No activity yet.'}
        </div>
        <div className={s.tiles} style={{ marginTop: 24 }}>
          {agent.tiles.map(([label, big, sub], i) => (
            <div key={i} className={s.tile}>
              <div className={s.eyebrow} style={{ marginBottom: 9 }}>{label}</div>
              <div className={s.tileBig}>{big}</div>
              <div className={s.tileSub}>{sub}</div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <>
      <div className={s.tiles}>
        {agent.tiles.map(([label, big, sub], i) => (
          <div key={i} className={s.tile}>
            <div className={s.eyebrow} style={{ marginBottom: 9 }}>{label}</div>
            <div className={s.tileBig}>{big}</div>
            <div className={s.tileSub}>{sub}</div>
          </div>
        ))}
      </div>

      <div className={`${s.eyebrow} ${s.drawerSectionH}`}>Recent activity</div>
      {agent.feed.map(([time, text], i) => (
        <div key={i} className={s.feedItem}>
          <span className={s.feedItemTime}>{time}</span>
          <span>{text}</span>
        </div>
      ))}
    </>
  )
}
