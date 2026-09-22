'use client'

import { useRouter } from 'next/navigation'
import s from '../dashboard.module.css'
import type { MaiaContext } from '@/lib/maia-context'

interface Props {
  context: MaiaContext
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

export default function MorningBrief({ context }: Props) {
  const router = useRouter()
  const { todayAngle, thisWeekMeetings, weekStats, lastDiana, lastCoaching, irisDraft, dueCardsQualification, dueCardsByExam } = context

  const connectPct = weekStats.calls > 0 ? Math.round((weekStats.connects / weekStats.calls) * 100) : 0
  const needsApolloData = thisWeekMeetings.find(m => !m.hasBrief)
  const dianaStale = lastDiana === null || lastDiana.daysSince >= 3

  return (
    <div className={s.morningBrief}>
      <div className={s.morningBriefHead}>
        <div className={s.morningBriefGreet}>Good morning, Archie.</div>
        <div className={s.morningBriefDate}>{formatDate(context.currentDate)}</div>
      </div>

      <div className={s.morningBriefGrid}>
        {/* TODAY'S ANGLE */}
        <div className={s.morningBriefCard}>
          <div className={s.morningBriefCardLabel}>Today&apos;s angle</div>
          {todayAngle ? (
            <>
              <p className={s.morningBriefAngleText}>📞 {todayAngle}</p>
              <button className={s.morningBriefBtn} onClick={() => router.push('/dashboard/cassandra')}>Open CASSANDRA</button>
            </>
          ) : (
            <p className={s.morningBriefEmpty}>No specific angle today — standard calls. Focus on the opener.</p>
          )}
        </div>

        {/* THIS WEEK'S MEETINGS */}
        <div className={s.morningBriefCard}>
          <div className={s.morningBriefCardLabel}>This week&apos;s meetings</div>
          {thisWeekMeetings.length > 0 ? (
            <>
              {thisWeekMeetings.map((m, i) => (
                <div className={s.morningBriefMeetingRow} key={i}>
                  <div>
                    <div className={s.morningBriefMeetingName}>{m.prospectName}</div>
                    <div className={s.morningBriefMeetingDetail}>{m.meetingDetails}</div>
                  </div>
                  <span className={s.morningBriefMeetingFlag}>{m.hasBrief ? '✅' : '⚠️'}</span>
                </div>
              ))}
              {needsApolloData && (
                <div className={s.morningBriefWarn}>
                  ⚠️ {needsApolloData.prospectName} has no APOLLO brief yet.{' '}
                  <button className={s.morningBriefBtn} style={{ marginTop: 6 }} onClick={() => router.push('/dashboard/oracle')}>Run ORACLE before calling?</button>
                </div>
              )}
            </>
          ) : (
            <p className={s.morningBriefEmpty}>No meetings booked yet this week. Push hard today.</p>
          )}
        </div>

        {/* YOUR WEEK */}
        <div className={s.morningBriefCard}>
          <div className={s.morningBriefCardLabel}>Your week</div>
          <div className={s.morningBriefStats}>
            <div className={s.morningBriefStat}>
              <span className={s.morningBriefStatVal}>{weekStats.calls}</span>
              <span className={s.morningBriefStatLabel}>Calls</span>
            </div>
            <div className={s.morningBriefStat}>
              <span className={s.morningBriefStatVal}>{weekStats.connects} {weekStats.calls > 0 ? `(${connectPct}%)` : ''}</span>
              <span className={s.morningBriefStatLabel}>Connects</span>
            </div>
            <div className={s.morningBriefStat}>
              <span className={s.morningBriefStatVal}>{weekStats.meetingsBooked}</span>
              <span className={s.morningBriefStatLabel}>Booked</span>
            </div>
            <div className={s.morningBriefStat}>
              <span className={s.morningBriefStatVal}>{weekStats.meetingsSat}</span>
              <span className={s.morningBriefStatLabel}>Meetings sat</span>
            </div>
          </div>
        </div>

        {/* FOCUS TODAY */}
        <div className={s.morningBriefCard}>
          <div className={s.morningBriefCardLabel}>Focus today</div>

          <div className={s.morningBriefFocusItem}>
            <div className={s.morningBriefFocusTitle}>🎯 DIANA — opener practice</div>
            <div className={s.morningBriefFocusDetail}>
              {lastCoaching ? `APOLLO flagged: "${lastCoaching}"` : dianaStale ? "You haven't practiced in 3 days — 20 minutes before first call?" : 'No outstanding coaching notes.'}
            </div>
          </div>

          <div className={s.morningBriefFocusItem}>
            <div className={s.morningBriefFocusTitle}>📚 ATHENA — {dueCardsQualification} card{dueCardsQualification !== 1 ? 's' : ''} due</div>
            {(dueCardsByExam.R01 > 0 || dueCardsByExam.R06 > 0) && (
              <div className={s.morningBriefFocusDetail}>R01: {dueCardsByExam.R01} · R06: {dueCardsByExam.R06}</div>
            )}
          </div>

          <div className={s.morningBriefFocusItem}>
            <div className={s.morningBriefFocusTitle}>✍️ {irisDraft ? `IRIS post ready — ${irisDraft.topic}` : 'IRIS — no draft pending'}</div>
            {irisDraft && <button className={s.morningBriefBtn} onClick={() => router.push('/dashboard/iris')}>Review post</button>}
          </div>
        </div>
      </div>
    </div>
  )
}
