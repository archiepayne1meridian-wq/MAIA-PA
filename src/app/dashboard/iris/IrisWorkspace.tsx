'use client'

import { useEffect, useState, useCallback } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import s from '../dashboard.module.css'

interface IrisPost {
  id: string
  slot: string
  pillar: number
  topic: string
  copy: string
  image_url: string | null
  format: string | null
  status: string
  impressions: number
  likes: number
  comments: number
  reposts: number
  created_at: number
}

interface IrisData {
  posts: IrisPost[]
  draft: IrisPost | null
  preferences: { id: string; preference_type: string; value: string }[]
}

const PILLAR_LABEL: Record<number, string> = { 1: 'Markets', 2: 'Expat Finance', 3: 'Sports & Culture' }
const PILLAR_COLOR: Record<number, string> = {
  1: 'var(--accent)',
  2: 'var(--online)',
  3: 'var(--idle)',
}

function relDate(ts: number): string {
  const d = new Date(ts * 1000)
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

export default function IrisWorkspace() {
  const [data, setData] = useState<IrisData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [approving, setApproving] = useState(false)
  const [approveMsg, setApproveMsg] = useState<string | null>(null)

  // Refinement state
  const [refineFeedback, setRefineFeedback] = useState('')
  const [refining, setRefining] = useState(false)
  const [refineMsg, setRefineMsg] = useState<string | null>(null)

  // Performance log state
  const [perfOpenId, setPerfOpenId] = useState<string | null>(null)
  const [perfValues, setPerfValues] = useState<Record<string, { impressions: number; likes: number; comments: number; reposts: number }>>({})
  const [perfSavingId, setPerfSavingId] = useState<string | null>(null)
  const [perfSaveMsg, setPerfSaveMsg] = useState<Record<string, string>>({})

  const load = useCallback(() => {
    setError(null)
    fetch('/api/dashboard/iris')
      .then(r => {
        if (!r.ok) throw new Error(`${r.status}`)
        return r.json() as Promise<IrisData>
      })
      .then(d => {
        setData(d)
        // Initialise perf values from existing data
        const init: Record<string, { impressions: number; likes: number; comments: number; reposts: number }> = {}
        for (const p of d.posts) {
          init[p.id] = {
            impressions: p.impressions ?? 0,
            likes: p.likes ?? 0,
            comments: p.comments ?? 0,
            reposts: p.reposts ?? 0,
          }
        }
        setPerfValues(init)
      })
      .catch((e: Error) => setError(e.message))
  }, [])

  useEffect(() => { load() }, [load])

  async function approve(id: string) {
    setApproving(true)
    setApproveMsg(null)
    try {
      const res = await fetch('/api/dashboard/iris', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'approve' }),
      })
      if (!res.ok) throw new Error(`${res.status}`)
      setApproveMsg('Approved — paste to LinkedIn when ready.')
      load()
    } catch (e) {
      setApproveMsg(`Error: ${String(e)}`)
    } finally {
      setApproving(false)
    }
  }

  async function refineDraft() {
    if (!data?.draft || !refineFeedback.trim() || refining) return
    setRefining(true)
    setRefineMsg(null)
    try {
      const res = await fetch('/api/dashboard/iris/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftId: data.draft.id, feedback: refineFeedback }),
      })
      const result = await res.json() as { copy?: string; error?: string }
      if (result.copy) {
        setData(prev => prev && prev.draft
          ? { ...prev, draft: { ...prev.draft, copy: result.copy! } }
          : prev)
        setRefineMsg('Regenerated.')
        setRefineFeedback('')
      } else {
        setRefineMsg(result.error ?? 'Error regenerating')
      }
    } catch (e) {
      setRefineMsg(`Error: ${String(e)}`)
    } finally {
      setRefining(false)
    }
  }

  async function savePerformance(postId: string) {
    const vals = perfValues[postId]
    if (!vals) return
    setPerfSavingId(postId)
    setPerfSaveMsg(prev => ({ ...prev, [postId]: '' }))
    try {
      const res = await fetch('/api/dashboard/iris/performance', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId, ...vals }),
      })
      if (!res.ok) throw new Error(`${res.status}`)
      setPerfSaveMsg(prev => ({ ...prev, [postId]: 'Saved.' }))
    } catch (e) {
      setPerfSaveMsg(prev => ({ ...prev, [postId]: `Error: ${String(e)}` }))
    } finally {
      setPerfSavingId(null)
    }
  }

  if (error) return <div className={s.irisError}>{error}</div>
  if (!data) return <div className={s.irisLoading}>Loading…</div>

  const { draft, posts, preferences } = data
  const history = posts.filter(p => p.status !== 'draft')

  // "What's Working" — pillar distribution + top format
  const pillarCounts = [1, 2, 3].map(p => ({
    name: PILLAR_LABEL[p],
    value: history.filter(h => h.pillar === p).length,
    color: PILLAR_COLOR[p],
  })).filter(p => p.value > 0)

  const formatCounts = history.reduce<Record<string, number>>((acc, p) => {
    if (p.format) acc[p.format] = (acc[p.format] ?? 0) + 1
    return acc
  }, {})
  const topFormat = Object.entries(formatCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

  const hasPerformanceData = history.some(p => (p.impressions ?? 0) > 0)

  return (
    <div className={s.irisWs}>

      {/* Current draft */}
      <section className={s.irisDraftSection}>
        <span className={s.eyebrow}>Current draft</span>
        {draft ? (
          <div className={s.irisDraftCard}>
            <div className={s.irisDraftMeta}>
              <span
                className={s.irisPillarTag}
                style={{ borderColor: PILLAR_COLOR[draft.pillar], color: PILLAR_COLOR[draft.pillar] }}
              >
                {PILLAR_LABEL[draft.pillar]}
              </span>
              <span className={s.irisDraftSlotTag}>{draft.slot}</span>
              {draft.format && <span className={s.irisDraftFormatTag}>{draft.format}</span>}
            </div>

            <div className={s.irisDraftTopic}>{draft.topic}</div>

            {draft.image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={draft.image_url}
                alt="IRIS generated image"
                className={s.irisDraftImage}
              />
            )}

            <pre className={s.irisCopy}>{draft.copy}</pre>

            {approveMsg && <p className={s.irisApproveMsg}>{approveMsg}</p>}

            <div className={s.irisDraftActions}>
              <button
                className={s.irisApproveBtn}
                onClick={() => void approve(draft.id)}
                disabled={approving}
              >
                {approving ? 'Approving…' : '✓ Approve — ready to post'}
              </button>
              <span className={s.irisDraftHint}>Refine below or in Slack</span>
            </div>

            {/* Refinement area */}
            <div className={s.irisRefineArea}>
              <textarea
                className={s.irisRefineTextarea}
                placeholder="Feedback to refine… (e.g. make it shorter, more conversational, add a stat)"
                value={refineFeedback}
                onChange={e => setRefineFeedback(e.target.value)}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button
                  className={s.irisRegenBtn}
                  onClick={() => void refineDraft()}
                  disabled={refining || !refineFeedback.trim()}
                >
                  {refining ? 'Regenerating…' : 'Regenerate'}
                </button>
                {refineMsg && <span className={s.irisRegenMsg}>{refineMsg}</span>}
              </div>
            </div>
          </div>
        ) : (
          <div className={s.irisNoDraft}>
            No draft pending. The cron delivers at 6am and 12pm CET (Mon–Fri).
          </div>
        )}
      </section>

      {/* Post history */}
      <section className={s.irisHistorySection}>
        <span className={s.eyebrow}>Post history (last 7 days)</span>
        {history.length > 0 ? (
          <div className={s.irisHistoryList}>
            {history.map(post => {
              const perfOpen = perfOpenId === post.id
              const pv = perfValues[post.id] ?? { impressions: 0, likes: 0, comments: 0, reposts: 0 }
              const saveMsg = perfSaveMsg[post.id]
              return (
                <div key={post.id} className={s.irisHistoryRow} style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span
                      className={s.irisPillarBar}
                      style={{ background: PILLAR_COLOR[post.pillar] }}
                      title={PILLAR_LABEL[post.pillar]}
                    />
                    <div className={s.irisHistoryBody}>
                      <div className={s.irisHistoryTopic}>{post.topic}</div>
                      <div className={s.irisHistoryMeta}>
                        <span>{relDate(post.created_at)}</span>
                        <span>{post.slot}</span>
                        <span className={`${s.irisStatusChip} ${post.status === 'approved' ? s.irisStatusApproved : ''}`}>
                          {post.status}
                        </span>
                      </div>
                    </div>
                    <button
                      className={s.irisPerfLogToggle}
                      onClick={() => setPerfOpenId(perfOpen ? null : post.id)}
                    >
                      {perfOpen ? '▲ Hide stats' : '▼ Log stats'}
                    </button>
                  </div>

                  {perfOpen && (
                    <div className={s.irisPerfLogArea}>
                      <div className={s.irisPerfInputGrid}>
                        {(['impressions', 'likes', 'comments', 'reposts'] as const).map(field => (
                          <div key={field} className={s.irisPerfInputWrap}>
                            <span className={s.irisPerfInputLabel}>{field.charAt(0).toUpperCase() + field.slice(1)}</span>
                            <input
                              type="number"
                              min={0}
                              className={s.irisPerfInput}
                              value={pv[field]}
                              onChange={e => setPerfValues(prev => ({
                                ...prev,
                                [post.id]: { ...pv, [field]: Math.max(0, parseInt(e.target.value, 10) || 0) },
                              }))}
                            />
                          </div>
                        ))}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <button
                          className={s.irisPerfSaveBtn}
                          onClick={() => void savePerformance(post.id)}
                          disabled={perfSavingId === post.id}
                        >
                          {perfSavingId === post.id ? 'Saving…' : 'Save'}
                        </button>
                        {saveMsg && <span className={s.irisPerfSaveMsg}>{saveMsg}</span>}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <div className={s.irisNoDraft}>No approved posts in the last 7 days.</div>
        )}
      </section>

      {/* What's Working */}
      {history.length >= 2 && (
        <section className={s.irisHistorySection}>
          <span className={s.eyebrow}>What's Working</span>
          <div className={s.irisWhatWorking}>
            {pillarCounts.length > 0 && (
              <div className={s.irisPieChartWrap}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pillarCounts}
                      cx="50%"
                      cy="50%"
                      outerRadius={55}
                      dataKey="value"
                      label={({ name, percent }) =>
                        `${name ?? ''} ${Math.round(((percent as number) ?? 0) * 100)}%`
                      }
                      labelLine={false}
                    >
                      {pillarCounts.map(entry => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: 'var(--raised)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}

            {topFormat && (
              <div className={s.irisBestFormat}>
                <span className={s.fpSectionLabel}>Top format</span>
                <div className={s.irisBestFormatVal}>{topFormat}</div>
                <div className={s.irisBestFormatSub}>{formatCounts[topFormat]} post{formatCounts[topFormat] > 1 ? 's' : ''} this week</div>
              </div>
            )}

            {hasPerformanceData ? (
              <p className={s.irisInsightText}>
                Performance data logged — keep tracking to surface content insights.
              </p>
            ) : (
              <p className={s.irisInsightEmpty}>
                Log post stats above to unlock engagement insights.
              </p>
            )}
          </div>
        </section>
      )}

      {/* Voice preferences */}
      {preferences.length > 0 && (
        <section className={s.irisPrefsSection}>
          <span className={s.eyebrow}>Voice memory ({preferences.length} preferences)</span>
          <div className={s.irisPrefs}>
            {preferences.slice(0, 8).map(p => (
              <div key={p.id} className={s.irisPrefRow}>
                <span className={s.irisPrefType}>{p.preference_type}</span>
                <span className={s.irisPrefValue}>{p.value}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
