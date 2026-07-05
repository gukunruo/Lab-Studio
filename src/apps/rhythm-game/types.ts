export type Lane = 0 | 1 | 2 | 3

export type Difficulty = 'easy' | 'normal' | 'hard'

export type Judgment = 'perfect' | 'great' | 'good' | 'miss'

export interface Note {
  id: number
  time: number
  lane: Lane
  hit: boolean
  missed: boolean
}

export interface HitEffect {
  lane: Lane
  time: number
  duration: number
  type: 'hit' | 'miss'
}

export interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  color: string
  size: number
}

export interface RingEffect {
  x: number
  y: number
  time: number
  duration: number
  color: string
  maxRadius: number
}

export interface JudgmentText {
  text: string
  color: string
  time: number
  duration: number
}

export interface GameResult {
  score: number
  maxCombo: number
  accuracy: number
  grade: string
  judgments: { perfect: number; great: number; good: number; miss: number }
  totalNotes: number
  fullCombo: boolean
}

export const LANE_COLORS = ['#3b82f6', '#2dd4bf', '#f59e0b', '#ec4899'] as const
export const LANE_KEYS = ['D', 'F', 'J', 'K'] as const
export const LANE_KEY_CODES: Record<string, Lane> = {
  KeyD: 0,
  KeyF: 1,
  KeyJ: 2,
  KeyK: 3,
}

export const JUDGMENT_CONFIG: Record<
  Judgment,
  { window: number; score: number; comboBonus: number; color: string; label: string }
> = {
  perfect: { window: 0.045, score: 300, comboBonus: 10, color: '#fbbf24', label: 'PERFECT' },
  great: { window: 0.09, score: 200, comboBonus: 5, color: '#2dd4bf', label: 'GREAT' },
  good: { window: 0.13, score: 100, comboBonus: 0, color: '#3b82f6', label: 'GOOD' },
  miss: { window: 0.15, score: 0, comboBonus: 0, color: '#ef4444', label: 'MISS' },
}

export const DIFFICULTY_THRESHOLD: Record<Difficulty, number> = {
  easy: 2.2,
  normal: 1.7,
  hard: 1.3,
}

export const DIFFICULTY_LABELS: Record<Difficulty, { zh: string; en: string }> = {
  easy: { zh: '简单', en: 'Easy' },
  normal: { zh: '普通', en: 'Normal' },
  hard: { zh: '困难', en: 'Hard' },
}
