'use client'

import { useRef, useState, useEffect } from 'react'
import s from '../hub.module.css'

interface Props {
  accept: string[]        // file extensions e.g. ['.mp3', '.pdf', '.png'] — dot optional
  onFile: (file: File) => void
  label?: string           // "Drop audio file" / "Drop image or paste URL"
  hint?: string             // small print under the label, e.g. accepted formats + size limit
  compact?: boolean         // small inline version vs full card
  disabled?: boolean
  icon?: string             // emoji shown in the full card variant
}

function normaliseExt(e: string): string {
  return e.replace(/^\./, '').toLowerCase()
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Browsers navigate the whole tab to a dropped file by default unless dragover/
// drop are prevented — and that default fires for ANY drop that lands outside
// the exact pixel bounds of a drop target, which a real mouse drag misses easily
// (Playwright's synthetic drops don't, which is why this was easy to miss in
// testing). Guarding at the window level, not just the drop target, is what
// actually stops the page from hijacking the drop regardless of exactly where
// the cursor releases.
function useWindowDragGuard() {
  useEffect(() => {
    function prevent(e: DragEvent) { e.preventDefault() }
    window.addEventListener('dragover', prevent)
    window.addEventListener('drop', prevent)
    return () => {
      window.removeEventListener('dragover', prevent)
      window.removeEventListener('drop', prevent)
    }
  }, [])
}

export default function FileDropZone({ accept, onFile, label, hint, compact, disabled, icon }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [lastFile, setLastFile] = useState<{ name: string; size: number } | null>(null)

  useWindowDragGuard()

  const acceptExts = accept.map(normaliseExt)
  const acceptAttr = accept.map(a => (a.startsWith('.') ? a : `.${a}`)).join(',')

  function validate(file: File): boolean {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    return acceptExts.includes(ext)
  }

  function handleFile(file: File) {
    if (disabled) return
    if (!validate(file)) return
    setLastFile({ name: file.name, size: file.size })
    onFile(file)
  }

  function handleDrop(e: React.DragEvent<HTMLElement>) {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = ''
  }

  if (compact) {
    return (
      <button
        type="button"
        className={`${s.fileDropCompact} ${dragOver ? s.fileDropCompactActive : ''}`}
        onDragOver={e => { e.preventDefault(); e.stopPropagation(); if (!disabled) setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => !disabled && inputRef.current?.click()}
        disabled={disabled}
        title={label ?? `Attach file (${acceptExts.join(', ')})`}
        aria-label={label ?? 'Attach file'}
      >
        <input ref={inputRef} type="file" accept={acceptAttr} style={{ display: 'none' }} onChange={handlePick} />
        🖇
      </button>
    )
  }

  return (
    <div
      className={`${s.fileDropCard} ${dragOver ? s.fileDropCardActive : ''}`}
      onDragOver={e => { e.preventDefault(); e.stopPropagation(); if (!disabled) setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={() => !disabled && inputRef.current?.click()}
    >
      <input ref={inputRef} type="file" accept={acceptAttr} style={{ display: 'none' }} onChange={handlePick} disabled={disabled} />
      {icon && <div className={s.fileDropIcon}>{icon}</div>}
      <p>{label ?? 'Drop a file here or click'}</p>
      {lastFile && <p className={s.fileDropSelected}>{lastFile.name} · {formatSize(lastFile.size)}</p>}
      {hint && <p className={s.fileDropHint}>{hint}</p>}
    </div>
  )
}
