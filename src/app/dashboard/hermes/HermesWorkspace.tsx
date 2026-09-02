'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import s from '../dashboard.module.css'
import { USFLAG, DRAWER_LABELS, type Persona, type ScriptLine, type SharedScript, type Objection } from '@/lib/hermes-default-script'

type Styles = typeof s

interface PersonasData { [id: string]: Persona }

interface ScriptState {
  P: PersonasData
  S: SharedScript
  O: Objection[]
}

const JUMP_LINKS: { href: string; label: string }[] = [
  { href: '#s-intro', label: 'Intro' },
  { href: '#s-factfind', label: 'Fact-Find' },
  { href: '#s-enlarge', label: 'Enlarge' },
  { href: '#s-disturb', label: 'Disturb' },
  { href: '#s-close', label: 'Close' },
  { href: '#s-soft', label: 'Soft Landing' },
  { href: '#s-outcome', label: 'Outcome' },
]

// ── HTML-string render helpers (ported 1:1 from call_script_tool.html) ──────
// These build raw HTML injected via ref.innerHTML rather than JSX, so that
// contenteditable cursor position survives re-renders — React never diffs
// this subtree, matching the original tool's own imperative DOM approach.

function esc(str: string): string {
  const d = document.createElement('div')
  d.innerText = str
  return d.innerHTML
}

function ed(styles: Styles, path: string, text: string, tag: string, cls: string): string {
  const classAttr = [styles.hermesEditable, cls].filter(Boolean).join(' ')
  return `<${tag} class="${classAttr}" data-path="${path}" contenteditable="true" spellcheck="false">${esc(text)}</${tag}>`
}

function lineHtml(styles: Styles, path: string, item: ScriptLine): string {
  if (typeof item === 'string') return `<li>${ed(styles, path, item, 'div', styles.hermesQText)}</li>`
  if (item.note) return `<li>${ed(styles, path + '.q', item.q, 'div', `${styles.hermesQText} ${styles.hermesQTextFlag}`)}</li>`
  let h = `<li>${ed(styles, path + '.q', item.q, 'div', styles.hermesQText)}`
  if (item.plant !== undefined) {
    h += `<details class="${styles.hermesPlant}"><summary>if he doesn't know</summary>${ed(styles, path + '.plant', item.plant, 'div', styles.hermesExplain)}</details>`
  }
  h += `</li>`
  return h
}

function buildDoc(styles: Styles, data: ScriptState, personaId: string): string {
  const p = data.P[personaId]
  const base = 'P.' + personaId
  let h = ''

  h += `<section class="${styles.hermesStage}" id="s-intro">
    <div class="${styles.hermesStageLabel}">Intro</div>
    ${ed(styles, base + '.intro', p.intro, 'div', styles.hermesSay)}
  </section>`

  h += `<section class="${styles.hermesStage}" id="s-factfind">
    <div class="${styles.hermesStageLabel}">Fact-Find</div>
    <ul class="${styles.hermesLines}">${p.opener.map((t, i) => lineHtml(styles, base + '.opener.' + i, t)).join('')}</ul>
  </section>`

  h += `<section class="${styles.hermesStage}" id="s-enlarge">
    <div class="${styles.hermesStageLabel}">Enlarge — whichever drawer he opens</div>
    <div class="${styles.hermesFork}">
      <div class="${styles.hermesForkGrid}">`
  ;(['pension', 'investments', 'cash'] as const).forEach(key => {
    h += `<div class="${styles.hermesForkCol}"><h4>${DRAWER_LABELS[key]}</h4>
      <ul class="${styles.hermesLines}">${p.drawers[key].map((t, i) => lineHtml(styles, base + '.drawers.' + key + '.' + i, t)).join('')}</ul>`
    if (key === 'pension' && p.pensionPivot) h += ed(styles, base + '.pensionPivot', p.pensionPivot, 'div', `${styles.hermesSay} ${styles.hermesSayPivot}`)
    if (key === 'investments' && p.investmentsPivot) h += ed(styles, base + '.investmentsPivot', p.investmentsPivot, 'div', `${styles.hermesSay} ${styles.hermesSayPivot}`)
    if (key === 'cash' && p.cashPivot) h += ed(styles, base + '.cashPivot', p.cashPivot, 'div', `${styles.hermesSay} ${styles.hermesSayPivot}`)
    if (p.usFlag && key !== 'cash') h += `<ul class="${styles.hermesLines}" style="margin-top:10px;"><li><div class="${styles.hermesQText} ${styles.hermesQTextFlag}">${esc(USFLAG)}</div></li></ul>`
    h += `</div>`
  })
  h += `</div></div>
    <div class="${styles.hermesConverge}">↓ whichever opened, continue below</div>
  </section>`

  h += `<section class="${styles.hermesStage}" id="s-disturb">
    <div class="${styles.hermesStageLabel}">Disturb</div>
    <ul class="${styles.hermesLines}">${data.S.disturb.map((t, i) => lineHtml(styles, 'S.disturb.' + i, t)).join('')}</ul>
  </section>`

  h += `<section class="${styles.hermesStage}" id="s-close">
    <div class="${styles.hermesStageLabel}">Close</div>
    ${ed(styles, 'S.close_gate', data.S.close_gate, 'div', styles.hermesSay)}
    <div style="height:16px;"></div>
    ${ed(styles, 'S.close_next', data.S.close_next, 'div', styles.hermesSay)}
    <div style="height:16px;"></div>
    <ul class="${styles.hermesLines}">${data.S.close_funnel.map((t, i) => lineHtml(styles, 'S.close_funnel.' + i, t)).join('')}</ul>
  </section>`

  h += `<section class="${styles.hermesStage}" id="s-soft">
    <div class="${styles.hermesStageLabel}">Soft Landing</div>
    <ul class="${styles.hermesLines}">${data.S.soft_landing.map((t, i) => lineHtml(styles, 'S.soft_landing.' + i, t)).join('')}</ul>
  </section>`

  h += `<section class="${styles.hermesStage}" id="s-outcome">
    <div class="${styles.hermesStageLabel}">Outcome</div>
    <div class="${styles.hermesFork}">
      <div class="${styles.hermesForkGrid} ${styles.hermesForkGridTwo}">
        <div class="${styles.hermesForkCol}"><h4>Booked</h4>
          <ul class="${styles.hermesChecklist}">${data.S.end_booked.map((t, i) => '<li>' + ed(styles, 'S.end_booked.' + i, t, 'span', '') + '</li>').join('')}</ul>
        </div>
        <div class="${styles.hermesForkCol}"><h4>Real no</h4>
          ${ed(styles, 'S.end_exit', data.S.end_exit, 'div', styles.hermesSay)}
        </div>
      </div>
    </div>
  </section>`

  h += `<div class="${styles.hermesRuleStrip}">Not sure of an answer? Don't guess — <b>pivot straight to booking Stephen.</b></div>`

  return h
}

function buildObjBody(styles: Styles, objections: Objection[], idx: number): string {
  const o = objections[idx]
  if (!o) return ''
  let h = `<div class="${styles.hermesObjBlock}"><div class="${styles.hermesObjQ}">${esc(o.label)}</div>`
  o.variants.forEach((v, j) => {
    h += `<div class="${styles.hermesObjVariant}"><div class="${styles.hermesVlabel}">${esc(v.label)}</div>${ed(styles, 'O.' + idx + '.variants.' + j + '.text', v.text, 'div', styles.hermesVtext)}</div>`
  })
  h += `</div>`
  return h
}

// ── Path-based mutation, mirroring the original resolveRoot/setPath ─────────

function setPathValue(state: ScriptState, path: string, value: string) {
  const parts = path.split('.')
  const rootKey = parts.shift()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let node: any = rootKey === 'P' ? state.P : rootKey === 'S' ? state.S : rootKey === 'O' ? state.O : null
  if (node === null) return
  for (let i = 0; i < parts.length - 1; i++) {
    const key: string | number = /^\d+$/.test(parts[i]) ? parseInt(parts[i], 10) : parts[i]
    node = node[key]
    if (node === undefined) return
  }
  const lastPart = parts[parts.length - 1]
  const lastKey: string | number = /^\d+$/.test(lastPart) ? parseInt(lastPart, 10) : lastPart
  node[lastKey] = value
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

// ── Component ────────────────────────────────────────────────────────────────

export default function HermesWorkspace() {
  const router = useRouter()
  const dataRef = useRef<ScriptState | null>(null)
  const docRef = useRef<HTMLDivElement>(null)
  const objBodyRef = useRef<HTMLDivElement>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [loading, setLoading] = useState(true)
  const [personaTabs, setPersonaTabs] = useState<{ id: string; label: string }[]>([])
  const [currentPersonaId, setCurrentPersonaId] = useState('generic')
  const [saveState, setSaveState] = useState<'saved' | 'dirty'>('saved')
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [objLabels, setObjLabels] = useState<string[]>([])
  const [activeObjIdx, setActiveObjIdx] = useState(0)

  const loadScript = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/dashboard/hermes/script')
    const json = await res.json() as { personas: PersonasData; shared: SharedScript; objections: Objection[] }
    dataRef.current = { P: json.personas, S: json.shared, O: json.objections }
    setPersonaTabs(Object.entries(json.personas).map(([id, p]) => ({ id, label: p.label })))
    setObjLabels(json.objections.map(o => o.label))
    setCurrentPersonaId('generic')
    setActiveObjIdx(0)
    setSaveState('saved')
    setSavedAt(new Date())
    setLoading(false)
  }, [])

  useEffect(() => { loadScript() }, [loadScript])

  // Rebuild the doc HTML only when persona tab changes (or data first loads) —
  // never on keystroke, so contenteditable cursor position is preserved.
  useEffect(() => {
    if (loading || !docRef.current || !dataRef.current) return
    docRef.current.innerHTML = buildDoc(s, dataRef.current, currentPersonaId)
  }, [loading, currentPersonaId])

  // Rebuild the objection modal body only when it opens or the nav selection changes.
  useEffect(() => {
    if (!modalOpen || !objBodyRef.current || !dataRef.current) return
    objBodyRef.current.innerHTML = buildObjBody(s, dataRef.current.O, activeObjIdx)
  }, [modalOpen, activeObjIdx])

  const persistNow = useCallback(async () => {
    if (!dataRef.current) return
    try {
      await fetch('/api/dashboard/hermes/script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personas: dataRef.current.P, shared: dataRef.current.S, objections: dataRef.current.O }),
      })
    } catch (err) {
      console.error('[HERMES] save failed', err)
    }
    setSaveState('saved')
    setSavedAt(new Date())
  }, [])

  function commitField(el: Element | null) {
    if (!el || !(el instanceof HTMLElement) || !el.matches('[data-path]')) return
    const path = el.getAttribute('data-path')
    if (!path || !dataRef.current) return
    const text = (el.innerText ?? '').replace(/\n{3,}/g, '\n\n')
    setPathValue(dataRef.current, path, text)
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

  function handleSaveClick() {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    commitField(document.activeElement)
    persistNow()
  }

  async function handleReset() {
    if (!window.confirm('Reset everything back to the locked default version? Your edits will be lost.')) return
    await fetch('/api/dashboard/hermes/reset', { method: 'POST' })
    await loadScript()
  }

  function handleTabClick(id: string) {
    setCurrentPersonaId(id)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function openModal() {
    setModalOpen(true)
  }

  function closeModal() {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    commitField(document.activeElement)
    persistNow()
    setModalOpen(false)
  }

  function handleOverlayClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) closeModal()
  }

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
                <div className={s.hermesPersonaTabs}>
                  {personaTabs.map(p => (
                    <button
                      key={p.id}
                      className={[s.hermesPersonaTab, p.id === currentPersonaId ? s.hermesPersonaTabActive : ''].filter(Boolean).join(' ')}
                      onClick={() => handleTabClick(p.id)}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <span className={[s.hermesSaveStatus, saveState === 'dirty' ? s.hermesSaveStatusDirty : s.hermesSaveStatusSaved].join(' ')}>
                  {saveState === 'dirty' ? 'Unsaved changes…' : savedAt ? `Saved ${pad2(savedAt.getHours())}:${pad2(savedAt.getMinutes())}` : 'Saved'}
                </span>
                <button className={s.hermesSaveBtn} onClick={handleSaveClick}>Save</button>
                <button className={s.hermesResetBtn} onClick={handleReset}>reset to default</button>
              </div>
            </div>

            <div className={s.hermesEditNote}>Click any line to edit — autosaves shortly after you stop typing, or hit Save to be sure.</div>

            <div className={s.hermesJumpNav}>
              {JUMP_LINKS.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}
            </div>

            <div
              className={s.hermesDoc}
              ref={docRef}
              onInput={handleInput}
              onBlur={handleBlur}
            />

            <button className={s.hermesFab} onClick={openModal}>Objection hit?</button>

            <div
              className={[s.hermesModalOverlay, modalOpen ? s.hermesModalOverlayOpen : ''].filter(Boolean).join(' ')}
              onClick={handleOverlayClick}
            >
              <div className={s.hermesModal}>
                <div className={s.hermesModalHead}>
                  <h2>Objections</h2>
                  <button className={s.hermesModalClose} onClick={closeModal}>✕</button>
                </div>
                <div className={s.hermesModalBody}>
                  <div className={s.hermesLoopDiagram}>
                    <div className={s.hermesLoopStep}>DEFLECT</div><div className={s.hermesLoopArrow}>→</div>
                    <div className={s.hermesLoopStep}>RAISE CERTAINTY</div><div className={s.hermesLoopArrow}>→</div>
                    <div className={s.hermesLoopStep}>BACK TO THE ASK</div>
                  </div>

                  <div className={s.hermesObjNav}>
                    {objLabels.map((label, i) => (
                      <button
                        key={label}
                        className={i === activeObjIdx ? s.hermesObjNavActive : undefined}
                        onClick={() => setActiveObjIdx(i)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  <div ref={objBodyRef} onInput={handleInput} onBlur={handleBlur} />

                  <div className={s.hermesMH}>Reflex or real?</div>
                  <div className={s.hermesCertRow}><span className={s.hermesCertTag} style={{ color: 'var(--h-success)' }}>REFLEX</span><span>Arrives before he&apos;s heard you. Absorb lightly, loop. Don&apos;t argue it.</span></div>
                  <div className={s.hermesCertRow}><span className={s.hermesCertTag} style={{ color: 'var(--h-danger)' }}>REAL</span><span>Arrives after — about something you actually said. Answer it properly, then loop back to the ask.</span></div>

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
