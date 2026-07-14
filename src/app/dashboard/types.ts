export type AgentStatus = 'online' | 'idle' | 'alert'
export type OrbState = 'idle' | 'listening' | 'thinking' | 'speaking'
export type DotStyle = 'done' | 'now' | 'pending' | ''

export interface Agent {
  id: string
  role: string
  badge: string
  status: AgentStatus
  stat: string
  statusLabel: string
  prog: number
  progAlert: boolean
  tiles: [string, string, string][]
  feed: [string, string][]
  inactive?: boolean
}

export interface Task {
  text: string
  meta: string
  warn?: string
  done: boolean
}

export interface CalEvent {
  time: string
  title: string
  tag: string
  dot: DotStyle
}

export interface MaiaTask {
  id: string
  title: string
  due_date: string | null
  completed: number
  completed_at: number | null
  source: string
  created_at: number
}

export interface NonNegotiables {
  linkedinToday: number
  dianaToday: number
  athenaToday: number
}
