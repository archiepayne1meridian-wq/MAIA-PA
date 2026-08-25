// Product Visualizer — database CRUD for saved structured notes.
// Pure data access, no calculations (those live in src/lib/structured-note-calc.ts).

import { getDb } from '@/db'
import { visualizer_notes } from '@/db/schema'
import { eq, desc } from 'drizzle-orm'

export interface VisualizerNote {
  id: string
  name: string
  underlying_asset: string
  autocall_barrier: number
  coupon_barrier: number
  capital_protection: number
  coupon_rate: number
  term_years: number
  observation_frequency: string
  investment_amount: number
  created_at: number
}

export async function listNotes(): Promise<VisualizerNote[]> {
  const rows = await getDb()
    .select()
    .from(visualizer_notes)
    .orderBy(desc(visualizer_notes.created_at))
  return rows as VisualizerNote[]
}

export async function createNote(opts: {
  name: string
  underlyingAsset: string
  autocallBarrier: number
  couponBarrier: number
  capitalProtection: number
  couponRate: number
  termYears: number
  observationFrequency: string
  investmentAmount: number
}): Promise<VisualizerNote> {
  const id = crypto.randomUUID()
  const now = Math.floor(Date.now() / 1000)
  const row = {
    id,
    name: opts.name,
    underlying_asset: opts.underlyingAsset,
    autocall_barrier: opts.autocallBarrier,
    coupon_barrier: opts.couponBarrier,
    capital_protection: opts.capitalProtection,
    coupon_rate: opts.couponRate,
    term_years: opts.termYears,
    observation_frequency: opts.observationFrequency,
    investment_amount: opts.investmentAmount,
    created_at: now,
  }
  await getDb().insert(visualizer_notes).values(row)
  return row as VisualizerNote
}

export async function deleteNote(id: string): Promise<void> {
  await getDb().delete(visualizer_notes).where(eq(visualizer_notes.id, id))
}
