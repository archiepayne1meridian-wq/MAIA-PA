import { describe, it, expect } from 'vitest'
import {
  parseTranscript,
  appendTurnToTranscript,
  isSessionExpired,
  SESSION_TIMEOUT_SECS,
  type DianaTranscriptTurn,
} from './diana-db'

// ── parseTranscript ───────────────────────────────────────────────────────────

describe('parseTranscript', () => {
  it('returns an empty array for the default empty transcript', () => {
    expect(parseTranscript('[]')).toEqual([])
  })

  it('parses a valid transcript', () => {
    const turns: DianaTranscriptTurn[] = [
      { role: 'diana', text: 'Hello, who is calling?', ts: 1000 },
      { role: 'user', text: 'Hi, my name is Archie.', ts: 1001 },
    ]
    expect(parseTranscript(JSON.stringify(turns))).toEqual(turns)
  })

  it('returns empty array for invalid JSON', () => {
    expect(parseTranscript('{not json')).toEqual([])
  })

  it('returns empty array when JSON is not an array', () => {
    expect(parseTranscript('{"role":"user"}')).toEqual([])
  })

  it('returns empty array for an empty string', () => {
    expect(parseTranscript('')).toEqual([])
  })
})

// ── appendTurnToTranscript ────────────────────────────────────────────────────

describe('appendTurnToTranscript', () => {
  const NOW = 1750000000

  it('appends the first user turn to an empty transcript', () => {
    const result = appendTurnToTranscript([], 'user', 'Hello there', NOW)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ role: 'user', text: 'Hello there', ts: NOW })
  })

  it('appends a diana turn after a user turn', () => {
    const existing: DianaTranscriptTurn[] = [{ role: 'user', text: 'Hello', ts: NOW }]
    const result = appendTurnToTranscript(existing, 'diana', 'Yes, what can I do for you?', NOW + 1)
    expect(result).toHaveLength(2)
    expect(result[1]).toEqual({ role: 'diana', text: 'Yes, what can I do for you?', ts: NOW + 1 })
  })

  it('does not mutate the original array', () => {
    const existing: DianaTranscriptTurn[] = [{ role: 'user', text: 'Hi', ts: NOW }]
    appendTurnToTranscript(existing, 'diana', 'Response', NOW)
    expect(existing).toHaveLength(1)
  })

  it('preserves all previous turns in order', () => {
    const t1: DianaTranscriptTurn = { role: 'diana', text: 'Opening', ts: NOW }
    const t2: DianaTranscriptTurn = { role: 'user', text: 'Reply', ts: NOW + 1 }
    const result = appendTurnToTranscript([t1, t2], 'diana', 'Counter', NOW + 2)
    expect(result).toHaveLength(3)
    expect(result[0]).toEqual(t1)
    expect(result[1]).toEqual(t2)
    expect(result[2]).toEqual({ role: 'diana', text: 'Counter', ts: NOW + 2 })
  })
})

// ── isSessionExpired ──────────────────────────────────────────────────────────

describe('isSessionExpired', () => {
  it('returns false for a session active 1 minute ago', () => {
    const now = 1750000000
    expect(isSessionExpired(now - 60, now)).toBe(false)
  })

  it('returns false for a session active exactly at the timeout boundary', () => {
    const now = 1750000000
    expect(isSessionExpired(now - SESSION_TIMEOUT_SECS, now)).toBe(false)
  })

  it('returns true for a session inactive 1 second past the timeout', () => {
    const now = 1750000000
    expect(isSessionExpired(now - SESSION_TIMEOUT_SECS - 1, now)).toBe(true)
  })

  it('returns true for a session that was last active many hours ago', () => {
    const now = 1750000000
    expect(isSessionExpired(now - 8 * 60 * 60, now)).toBe(true)
  })

  it('returns false for a session active right now', () => {
    const now = 1750000000
    expect(isSessionExpired(now, now)).toBe(false)
  })

  it('SESSION_TIMEOUT_SECS is 4 hours (14400 seconds)', () => {
    expect(SESSION_TIMEOUT_SECS).toBe(14400)
  })
})
