import type { Note, Lane, Judgment, Particle, RingEffect, JudgmentText, GameResult } from './types'
import { JUDGMENT_CONFIG, LANE_COLORS } from './types'
import { gradeFromAccuracy } from './chart'

export interface EngineConfig {
  laneX: number[]
  hitY: number
}

export class GameEngine {
  notes: Note[]
  private nextIndex = 0

  score = 0
  combo = 0
  maxCombo = 0
  judgments = { perfect: 0, great: 0, good: 0, miss: 0 }

  particles: Particle[] = []
  rings: RingEffect[] = []
  texts: JudgmentText[] = []
  laneFlash: number[] = [0, 0, 0, 0]
  laneHold: boolean[] = [false, false, false, false]

  private cfg: EngineConfig

  constructor(notes: Note[], cfg: EngineConfig) {
    this.notes = notes.map((n) => ({ ...n, hit: false, missed: false }))
    this.cfg = cfg
  }

  setConfig(cfg: EngineConfig) {
    this.cfg = cfg
  }

  update(currentTime: number) {
    while (this.nextIndex < this.notes.length) {
      const note = this.notes[this.nextIndex]
      if (!note) break
      if (note.hit || note.missed) {
        this.nextIndex++
        continue
      }
      if (note.time + JUDGMENT_CONFIG.miss.window < currentTime) {
        note.missed = true
        this.judgments.miss++
        this.combo = 0
        this.spawnText('miss', currentTime)
        this.nextIndex++
      } else {
        break
      }
    }

    this.particles = this.particles.filter((p) => {
      p.x += p.vx
      p.y += p.vy
      p.vy += 0.2
      p.life--
      return p.life > 0
    })

    this.rings = this.rings.filter((r) => currentTime - r.time < r.duration)
    this.texts = this.texts.filter((t) => currentTime - t.time < t.duration)
  }

  onHit(lane: Lane, currentTime: number): Judgment | null {
    this.laneFlash[lane] = currentTime

    let bestNote: Note | null = null
    let bestDelta = Infinity

    for (let i = Math.max(0, this.nextIndex - 4); i < this.notes.length; i++) {
      const note = this.notes[i]!
      if (note.lane !== lane || note.hit || note.missed) continue
      const delta = note.time - currentTime
      if (delta > JUDGMENT_CONFIG.miss.window) break
      if (delta < -JUDGMENT_CONFIG.miss.window) continue
      const absDelta = Math.abs(delta)
      if (absDelta < bestDelta) {
        bestDelta = absDelta
        bestNote = note
      }
    }

    if (!bestNote) return null

    let judgment: Judgment
    if (bestDelta < JUDGMENT_CONFIG.perfect.window) judgment = 'perfect'
    else if (bestDelta < JUDGMENT_CONFIG.great.window) judgment = 'great'
    else if (bestDelta < JUDGMENT_CONFIG.good.window) judgment = 'good'
    else judgment = 'miss'

    bestNote.hit = true
    this.judgments[judgment]++

    if (judgment === 'miss') {
      this.combo = 0
    } else {
      this.combo++
      if (this.combo > this.maxCombo) this.maxCombo = this.combo
      const bonus = this.combo * JUDGMENT_CONFIG[judgment].comboBonus
      this.score += JUDGMENT_CONFIG[judgment].score + bonus
    }

    this.spawnHitEffect(lane, judgment, currentTime)
    return judgment
  }

  private spawnHitEffect(lane: Lane, judgment: Judgment, time: number) {
    const x = this.cfg.laneX[lane]!
    const y = this.cfg.hitY
    const color = LANE_COLORS[lane]!

    this.rings.push({
      x,
      y,
      time,
      duration: 0.35,
      color: judgment === 'miss' ? '#ef4444' : color,
      maxRadius: judgment === 'perfect' ? 50 : judgment === 'great' ? 40 : 32,
    })

    if (judgment !== 'miss') {
      const count = judgment === 'perfect' ? 12 : judgment === 'great' ? 8 : 5
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 + (i * 0.7)
        const speed = 2 + Math.random() * 3
        this.particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 1,
          life: 28 + Math.floor(Math.random() * 10),
          maxLife: 38,
          color,
          size: 2.5 + Math.random() * 2,
        })
      }
    }

    this.spawnText(judgment, time)
  }

  private spawnText(judgment: Judgment, time: number) {
    const cfg = JUDGMENT_CONFIG[judgment]
    this.texts.push({
      text: cfg.label,
      color: cfg.color,
      time,
      duration: 0.6,
    })
  }

  getAccuracy(): number {
    const total = this.judgments.perfect + this.judgments.great + this.judgments.good + this.judgments.miss
    if (total === 0) return 0
    return (
      (this.judgments.perfect * 1 + this.judgments.great * 0.66 + this.judgments.good * 0.33) / total
    )
  }

  isFinished(currentTime: number, duration: number): boolean {
    return currentTime > duration + 1 || this.nextIndex >= this.notes.length
  }

  getResult(duration: number): GameResult {
    const accuracy = this.getAccuracy()
    const total = this.notes.length
    const fullCombo = this.judgments.miss === 0
    return {
      score: this.score,
      maxCombo: this.maxCombo,
      accuracy,
      grade: gradeFromAccuracy(accuracy),
      judgments: { ...this.judgments },
      totalNotes: total,
      fullCombo,
    }
  }

  getActiveNotes(currentTime: number, approachTime: number): Note[] {
    const active: Note[] = []
    for (let i = Math.max(0, this.nextIndex - 2); i < this.notes.length; i++) {
      const note = this.notes[i]!
      if (note.hit || note.missed) continue
      if (note.time - currentTime > approachTime) break
      if (note.time - currentTime < -0.2) continue
      active.push(note)
    }
    return active
  }
}
