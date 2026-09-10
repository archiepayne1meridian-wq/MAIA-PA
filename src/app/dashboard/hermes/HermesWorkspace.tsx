'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import s from '../dashboard.module.css'

type Styles = typeof s

// Local copies of the shapes returned by the API — deliberately not imported
// from tools/hermes-db.ts, which pulls in getDb()/better-sqlite3 and must
// never end up in a client bundle.
interface ObjectionPair {
  objection: string
  response: string
}

interface HermesScenario {
  id: string
  name: string
  angle: string | null
  opener: string
  fact_find_questions: string[]
  enlarge_points: string[]
  disturb_points: string[]
  product_pathway: string
  product_questions: string[]
  close_script: string
  soft_landing: string
  objections: ObjectionPair[]
  active: boolean
  created_at: number
  updated_at: number
}

type TabId = 'opener' | 'factfind' | 'enlarge' | 'disturb' | 'close' | 'objections'

const TABS: { id: TabId; label: string }[] = [
  { id: 'opener', label: 'Opener' },
  { id: 'factfind', label: 'Fact Find' },
  { id: 'enlarge', label: 'Enlarge' },
  { id: 'disturb', label: 'Disturb' },
  { id: 'close', label: 'Close' },
  { id: 'objections', label: 'Objections' },
]

// ── HTML-string render helpers — same imperative pattern as before: these
// build raw HTML injected via ref.innerHTML rather than JSX, so contenteditable
// cursor position survives re-renders (React never diffs this subtree). Only
// rebuilt on scenario/tab switch, never on keystroke. ──────────────────────

function esc(str: string): string {
  const d = document.createElement('div')
  d.innerText = str
  return d.innerHTML
}

function ed(styles: Styles, path: string, text: string, tag: string, cls: string): string {
  const classAttr = [styles.hermesEditable, cls].filter(Boolean).join(' ')
  return `<${tag} class="${classAttr}" data-path="${path}" contenteditable="true" spellcheck="false">${esc(text)}</${tag}>`
}

function listHtml(styles: Styles, path: string, items: string[]): string {
  if (items.length === 0) {
    return `<div class="${styles.hermesScenarioEmpty}">Nothing recorded for this section yet.</div>`
  }
  return `<ul class="${styles.hermesLines}">${items
    .map((t, i) => `<li>${ed(styles, `${path}.${i}`, t, 'div', styles.hermesQText)}</li>`)
    .join('')}</ul>`
}

function buildTabHtml(styles: Styles, scenario: HermesScenario, tab: TabId): string {
  switch (tab) {
    case 'opener':
      return `<section class="${styles.hermesStage}">
        <div class="${styles.hermesStageLabel}">Opener</div>
        ${ed(styles, 'opener', scenario.opener, 'div', styles.hermesSay)}
      </section>`
    case 'factfind':
      return `<section class="${styles.hermesStage}">
        <div class="${styles.hermesStageLabel}">Fact Find</div>
        ${listHtml(styles, 'fact_find_questions', scenario.fact_find_questions)}
      </section>`
    case 'enlarge':
      return `<section class="${styles.hermesStage}">
        <div class="${styles.hermesStageLabel}">Enlarge</div>
        ${listHtml(styles, 'enlarge_points', scenario.enlarge_points)}
      </section>`
    case 'disturb':
      return `<section class="${styles.hermesStage}">
        <div class="${styles.hermesStageLabel}">Disturb</div>
        ${listHtml(styles, 'disturb_points', scenario.disturb_points)}
      </section>`
    case 'close':
      return `<section class="${styles.hermesStage}">
        <div class="${styles.hermesStageLabel}">Close</div>
        ${ed(styles, 'close_script', scenario.close_script, 'div', styles.hermesSay)}
      </section>
      <section class="${styles.hermesStage}">
        <div class="${styles.hermesStageLabel}">Soft Landing</div>
        ${ed(styles, 'soft_landing', scenario.soft_landing, 'div', styles.hermesSay)}
      </section>`
    case 'objections':
      if (scenario.objections.length === 0) {
        return `<div class="${styles.hermesScenarioEmpty}">No objections recorded for this scenario yet.</div>`
      }
      return scenario.objections
        .map((o, i) => `<div class="${styles.hermesObjVariant}">
          ${ed(styles, `objections.${i}.objection`, o.objection, 'div', styles.hermesVlabel)}
          ${ed(styles, `objections.${i}.response`, o.response, 'div', styles.hermesVtext)}
        </div>`)
        .join('')
    default:
      return ''
  }
}

function buildObjModalBody(styles: Styles, objections: ObjectionPair[], idx: number): string {
  const o = objections[idx]
  if (!o) return ''
  return `<div class="${styles.hermesObjBlock}">
    <div class="${styles.hermesObjQ}">${esc(o.objection)}</div>
    <div class="${styles.hermesObjVariant}"><div class="${styles.hermesVtext}">${esc(o.response)}</div></div>
  </div>`
}

// ── Path-based mutation for a single scenario object ────────────────────────

function setScenarioPathValue(scenario: HermesScenario, path: string, value: string): string {
  const parts = path.split('.')
  const topKey = parts[0] as keyof HermesScenario

  if (parts.length === 1) {
    ;(scenario as unknown as Record<string, unknown>)[topKey] = value
    return topKey
  }
  if (topKey === 'fact_find_questions' || topKey === 'enlarge_points' || topKey === 'disturb_points' || topKey === 'product_questions') {
    const idx = parseInt(parts[1], 10)
    scenario[topKey][idx] = value
    return topKey
  }
  if (topKey === 'objections') {
    const idx = parseInt(parts[1], 10)
    const field = parts[2] as 'objection' | 'response'
    scenario.objections[idx][field] = value
    return topKey
  }
  return topKey
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function cardDescription(scenario: HermesScenario): string {
  const source = scenario.angle ?? scenario.product_pathway
  if (!source) return 'No description yet.'
  return source.length > 72 ? source.slice(0, 72).trim() + '…' : source
}

// ── Component ────────────────────────────────────────────────────────────────

export default function HermesWorkspace() {
  const router = useRouter()
  const scenariosRef = useRef<Map<string, HermesScenario>>(new Map())
  const tabDocRef = useRef<HTMLDivElement>(null)
  const objBodyRef = useRef<HTMLDivElement>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingScenarioIdRef = useRef<string | null>(null)

  const [loading, setLoading] = useState(true)
  const [scenarioOrder, setScenarioOrder] = useState<string[]>([])
  const [currentScenarioId, setCurrentScenarioId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TabId>('opener')
  const [todayAngle, setTodayAngle] = useState<string | null>(null)
  const [matchedScenarioId, setMatchedScenarioId] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<'saved' | 'dirty'>('saved')
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [activeObjIdx, setActiveObjIdx] = useState(0)
  const [, forceRender] = useState(0)

  const loadScript = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/dashboard/hermes/script')
    const json = await res.json() as {
      scenarios: HermesScenario[]
      todayAngle: string | null
      matchedScenarioId: string | null
    }
    const map = new Map<string, HermesScenario>()
    for (const sc of json.scenarios) map.set(sc.id, sc)
    scenariosRef.current = map
    setScenarioOrder(json.scenarios.map(sc => sc.id))
    setTodayAngle(json.todayAngle)
    setMatchedScenarioId(json.matchedScenarioId)
    setCurrentScenarioId(prev => (prev && map.has(prev)) ? prev : (json.scenarios[0]?.id ?? null))
    setActiveObjIdx(0)
    setSaveState('saved')
    setSavedAt(new Date())
    setLoading(false)
  }, [])

  useEffect(() => { loadScript() }, [loadScript])

  const currentScenario = currentScenarioId ? scenariosRef.current.get(currentScenarioId) ?? null : null

  // Rebuild the active tab's HTML only when scenario or tab changes — never
  // on keystroke, so contenteditable cursor position is preserved.
  useEffect(() => {
    if (loading || !tabDocRef.current || !currentScenario) return
    tabDocRef.current.innerHTML = buildTabHtml(s, currentScenario, activeTab)
  }, [loading, currentScenarioId, activeTab, currentScenario])

  useEffect(() => {
    if (!modalOpen || !objBodyRef.current || !currentScenario) return
    objBodyRef.current.innerHTML = buildObjModalBody(s, currentScenario.objections, activeObjIdx)
  }, [modalOpen, activeObjIdx, currentScenario])

  const persistNow = useCallback(async () => {
    const scenarioId = pendingScenarioIdRef.current
    if (!scenarioId) return
    const scenario = scenariosRef.current.get(scenarioId)
    if (!scenario) return
    pendingScenarioIdRef.current = null

    try {
      await fetch(`/api/dashboard/hermes/scenarios/${scenarioId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: scenario.name,
          opener: scenario.opener,
          fact_find_questions: scenario.fact_find_questions,
          enlarge_points: scenario.enlarge_points,
          disturb_points: scenario.disturb_points,
          product_pathway: scenario.product_pathway,
          product_questions: scenario.product_questions,
          close_script: scenario.close_script,
          soft_landing: scenario.soft_landing,
          objections: scenario.objections,
        }),
      })
    } catch (err) {
      console.error('[HERMES] save failed', err)
    }
    setSaveState('saved')
    setSavedAt(new Date())
  }, [])

  function commitField(el: Element | null) {
    if (!el || !(el instanceof HTMLElement) || !el.matches('[data-path]') || !currentScenario) return
    const path = el.getAttribute('data-path')
    if (!path) return
    const text = (el.innerText ?? '').replace(/\n{3,}/g, '\n\n')
    setScenarioPathValue(currentScenario, path, text)
    pendingScenarioIdRef.current = currentScenario.id
  }

  function handleInput(e: React.FormEvent<HTMLDivElement>) {
    const el = e.target
    if (!(el instanceof HTMLElement) || !el.matches('[data-path]')) return
    setSaveState('dirty')
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      commitField(el)
      persistNow()
    }, 700)
  }

  function handleBlur(e: React.FocusEvent<HTMLDivElement>) {
    const el = e.target
    if (!(el instanceof HTMLElement) || !el.matches('[data-path]')) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    commitField(el)
    persistNow()
  }

  function handleTabClick(tab: TabId) {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    commitField(document.activeElement)
    persistNow()
    setActiveTab(tab)
  }

  function handleScenarioClick(id: string) {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    commitField(document.activeElement)
    persistNow()
    setCurrentScenarioId(id)
    setActiveTab('opener')
  }

  async function handleNewScenario() {
    const res = await fetch('/api/dashboard/hermes/scenarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'New Scenario',
        opener: 'New opener — click to edit.',
        fact_find_questions: [],
        enlarge_points: [],
        disturb_points: [],
        product_pathway: '',
        product_questions: [],
        close_script: '',
        soft_landing: '',
        objections: [],
      }),
    })
    const json = await res.json() as { scenario: HermesScenario }
    scenariosRef.current.set(json.scenario.id, json.scenario)
    setScenarioOrder(order => [...order, json.scenario.id])
    setCurrentScenarioId(json.scenario.id)
    setActiveTab('opener')
  }

  function openModal() {
    setActiveObjIdx(0)
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
  }

  function handleOverlayClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) closeModal()
  }

  function handleNameEdit(e: React.FormEvent<HTMLHeadingElement>) {
    if (!currentScenario) return
    const text = (e.target as HTMLElement).innerText ?? ''
    currentScenario.name = text
    pendingScenarioIdRef.current = currentScenario.id
    setSaveState('dirty')
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      persistNow()
      forceRender(n => n + 1)
    }, 700)
  }

  function handleNameBlur() {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    persistNow()
    forceRender(n => n + 1)
  }

  const scenarios = scenarioOrder.map(id => scenariosRef.current.get(id)).filter((sc): sc is HermesScenario => Boolean(sc))

  return (
    <div>
      <button className={s.agentPageBack} onClick={() => router.push('/dashboard')} style={{ margin: '18px 0 0 24px' }}>← MAIA</button>

      <div className={s.hermesRoot}>
        {loading ? (
          <div className={s.hermesLoading}>Loading HERMES call script…</div>
        ) : (
          <>
            <div className={s.hermesTopbar}>
              <div className={s.hermesBrand}>deVere · Call Script</div>
              <div className={s.hermesTopRight}>
                <span className={[s.hermesSaveStatus, saveState === 'dirty' ? s.hermesSaveStatusDirty : s.hermesSaveStatusSaved].join(' ')}>
                  {saveState === 'dirty' ? 'Unsaved changes…' : savedAt ? `Saved ${pad2(savedAt.getHours())}:${pad2(savedAt.getMinutes())}` : 'Saved'}
                </span>
              </div>
            </div>

            <div className={s.hermesScenarioLayout}>
              <div className={s.hermesScenarioPanel}>
                {todayAngle && (
                  <div className={s.hermesTodayAngle}>
                    <div className={s.hermesTodayAngleLabel}>Today&apos;s Angle</div>
                    <div className={s.hermesTodayAngleText}>{todayAngle}</div>
                  </div>
                )}

                <div className={s.hermesScenarioList}>
                  {scenarios.map(sc => (
                    <button
                      key={sc.id}
                      className={[
                        s.hermesScenarioCard,
                        sc.id === currentScenarioId ? s.hermesScenarioCardActive : '',
                        sc.id === matchedScenarioId ? s.hermesScenarioCardMatched : '',
                      ].filter(Boolean).join(' ')}
                      onClick={() => handleScenarioClick(sc.id)}
                    >
                      <div className={s.hermesScenarioCardName}>{sc.name}</div>
                      <div className={s.hermesScenarioCardDesc}>{cardDescription(sc)}</div>
                    </button>
                  ))}
                </div>

                <button className={s.hermesNewScenarioBtn} onClick={handleNewScenario}>+ New Scenario</button>
              </div>

              <div className={s.hermesScenarioActive}>
                {currentScenario && (
                  <>
                    <h2
                      className={s.hermesScenarioTitle}
                      contentEditable
                      suppressContentEditableWarning
                      onInput={handleNameEdit}
                      onBlur={handleNameBlur}
                    >
                      {currentScenario.name}
                    </h2>

                    <div className={s.hermesScenarioTabs}>
                      {TABS.map(tab => (
                        <button
                          key={tab.id}
                          className={[s.hermesScenarioTab, tab.id === activeTab ? s.hermesScenarioTabActive : ''].filter(Boolean).join(' ')}
                          onClick={() => handleTabClick(tab.id)}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>

                    <div
                      className={s.hermesDoc}
                      ref={tabDocRef}
                      onInput={handleInput}
                      onBlur={handleBlur}
                    />

                    <div className={s.hermesProductPathway}>
                      <div className={s.hermesProductPathwayLabel}>Product Pathway — internal only, never say aloud</div>
                      <div
                        className={[s.hermesEditable, s.hermesProductPathwayText].join(' ')}
                        data-path="product_pathway"
                        contentEditable
                        suppressContentEditableWarning
                        spellCheck={false}
                        onInput={handleInput}
                        onBlur={handleBlur}
                      >
                        {currentScenario.product_pathway}
                      </div>
                      {currentScenario.product_questions.length > 0 && (
                        <ul className={s.hermesProductQuestions}>
                          {currentScenario.product_questions.map((q, i) => (
                            <li key={i}>
                              <div
                                className={s.hermesEditable}
                                data-path={`product_questions.${i}`}
                                contentEditable
                                suppressContentEditableWarning
                                spellCheck={false}
                                onInput={handleInput}
                                onBlur={handleBlur}
                              >
                                {q}
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>

            <button className={s.hermesFab} onClick={openModal}>Objection hit?</button>

            <div
              className={[s.hermesModalOverlay, modalOpen ? s.hermesModalOverlayOpen : ''].filter(Boolean).join(' ')}
              onClick={handleOverlayClick}
            >
              <div className={s.hermesModal}>
                <div className={s.hermesModalHead}>
                  <h2>Objections — {currentScenario?.name}</h2>
                  <button className={s.hermesModalClose} onClick={closeModal}>✕</button>
                </div>
                <div className={s.hermesModalBody}>
                  <div className={s.hermesLoopDiagram}>
                    <div className={s.hermesLoopStep}>DEFLECT</div><div className={s.hermesLoopArrow}>→</div>
                    <div className={s.hermesLoopStep}>RAISE CERTAINTY</div><div className={s.hermesLoopArrow}>→</div>
                    <div className={s.hermesLoopStep}>BACK TO THE ASK</div>
                  </div>

                  <div className={s.hermesObjNav}>
                    {(currentScenario?.objections ?? []).map((o, i) => (
                      <button
                        key={i}
                        className={i === activeObjIdx ? s.hermesObjNavActive : undefined}
                        onClick={() => setActiveObjIdx(i)}
                      >
                        {o.objection}
                      </button>
                    ))}
                  </div>

                  <div ref={objBodyRef} />

                  <div className={s.hermesMH}>If it&apos;s a real no</div>
                  <div className={s.hermesObjVariant}><div className={s.hermesVtext}>&quot;No problem at all — I&apos;ll leave you to it. Thank you for your time.&quot;</div></div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
