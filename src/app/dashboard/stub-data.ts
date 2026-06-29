// Calendar events are stubbed — no calendar integration yet (D4)
import type { CalEvent } from './types'

export const EVENTS: CalEvent[] = [
  { time: '07:30', title: 'DEMETER portfolio brief', tag: 'Delivered', dot: 'done' },
  { time: '07:30', title: 'CASSANDRA pre-market brief', tag: 'Delivered', dot: 'done' },
  { time: '08:30', title: 'MAIA morning digest', tag: 'Delivered', dot: 'done' },
  { time: '09:00', title: 'IRIS post scheduled', tag: 'Awaiting approval', dot: 'pending' },
  { time: '11:00', title: 'Study block — ATHENA', tag: 'Next up', dot: 'now' },
  { time: '14:00', title: 'Discovery call', tag: 'LUNA prep coming soon', dot: '' },
  { time: '16:30', title: 'CASSANDRA post-market brief', tag: 'Scheduled', dot: '' },
  { time: '22:00', title: 'HERA reflection', tag: 'Voice note', dot: '' },
]
