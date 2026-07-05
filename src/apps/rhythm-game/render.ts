import type { GameEngine } from './engine'
import { LANE_COLORS, LANE_KEYS, JUDGMENT_CONFIG } from './types'

export interface RenderConfig {
  width: number
  height: number
  laneX: number[]
  laneWidth: number
  hitY: number
  approachTime: number
  vibe: string
}

export function render(
  ctx: CanvasRenderingContext2D,
  engine: GameEngine,
  currentTime: number,
  cfg: RenderConfig,
) {
  ctx.clearRect(0, 0, cfg.width, cfg.height)

  drawBackground(ctx, cfg)
  drawLanes(ctx, engine, currentTime, cfg)
  drawHitLine(ctx, cfg)
  drawNotes(ctx, engine, currentTime, cfg)
  drawRings(ctx, engine, currentTime)
  drawParticles(ctx, engine)
  drawJudgmentText(ctx, engine, currentTime, cfg)
  drawKeyLabels(ctx, cfg)
}

function drawBackground(ctx: CanvasRenderingContext2D, cfg: RenderConfig) {
  ctx.fillStyle = '#0f0f11'
  ctx.fillRect(0, 0, cfg.width, cfg.height)

  const grad = ctx.createRadialGradient(
    cfg.width / 2,
    cfg.height * 0.25,
    0,
    cfg.width / 2,
    cfg.height * 0.25,
    cfg.width * 0.6,
  )
  grad.addColorStop(0, cfg.vibe + '22')
  grad.addColorStop(1, '#0f0f1100')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, cfg.width, cfg.height)

  const hitGlow = ctx.createLinearGradient(0, cfg.hitY - 60, 0, cfg.hitY + 60)
  hitGlow.addColorStop(0, '#0f0f1100')
  hitGlow.addColorStop(0.5, cfg.vibe + '10')
  hitGlow.addColorStop(1, '#0f0f1100')
  ctx.fillStyle = hitGlow
  ctx.fillRect(0, cfg.hitY - 60, cfg.width, 120)
}

function drawLanes(
  ctx: CanvasRenderingContext2D,
  engine: GameEngine,
  currentTime: number,
  cfg: RenderConfig,
) {
  const leftEdge = cfg.laneX[0]! - cfg.laneWidth / 2
  const totalWidth = cfg.laneWidth * 4

  ctx.fillStyle = '#ffffff08'
  ctx.fillRect(leftEdge, 0, totalWidth, cfg.height)

  for (let lane = 0; lane < 4; lane++) {
    const x = cfg.laneX[lane]!
    const flashAge = currentTime - engine.laneFlash[lane]!
    if (flashAge >= 0 && flashAge < 0.25) {
      const alpha = 0.18 * (1 - flashAge / 0.25)
      ctx.fillStyle = LANE_COLORS[lane]! + Math.round(alpha * 255).toString(16).padStart(2, '0')
      ctx.fillRect(x - cfg.laneWidth / 2, 0, cfg.laneWidth, cfg.height)
    }
  }

  ctx.strokeStyle = '#ffffff0a'
  ctx.lineWidth = 1
  for (let i = 0; i <= 4; i++) {
    const x = leftEdge + i * cfg.laneWidth
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, cfg.height)
    ctx.stroke()
  }
}

function drawHitLine(ctx: CanvasRenderingContext2D, cfg: RenderConfig) {
  const leftEdge = cfg.laneX[0]! - cfg.laneWidth / 2
  const totalWidth = cfg.laneWidth * 4

  ctx.shadowColor = '#ffffff'
  ctx.shadowBlur = 16
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(leftEdge, cfg.hitY)
  ctx.lineTo(leftEdge + totalWidth, cfg.hitY)
  ctx.stroke()

  ctx.shadowColor = cfg.vibe
  ctx.shadowBlur = 20
  for (let lane = 0; lane < 4; lane++) {
    const x = cfg.laneX[lane]!
    const r = 7
    ctx.strokeStyle = LANE_COLORS[lane]!
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.arc(x, cfg.hitY, r, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.shadowBlur = 0
}

function drawNotes(
  ctx: CanvasRenderingContext2D,
  engine: GameEngine,
  currentTime: number,
  cfg: RenderConfig,
) {
  const activeNotes = engine.getActiveNotes(currentTime, cfg.approachTime)
  const noteHeight = 16
  const noteWidth = cfg.laneWidth - 14

  for (const note of activeNotes) {
    const progress = 1 - (note.time - currentTime) / cfg.approachTime
    const y = progress * cfg.hitY - noteHeight / 2
    const x = cfg.laneX[note.lane]! - noteWidth / 2
    const color = LANE_COLORS[note.lane]!

    let alpha = 1
    if (progress < 0.05) alpha = progress / 0.05
    else if (progress > 1.05) alpha = Math.max(0, 1 - (progress - 1.05) / 0.1)

    ctx.globalAlpha = alpha
    ctx.shadowColor = color
    ctx.shadowBlur = 14

    ctx.fillStyle = color
    roundRect(ctx, x, y, noteWidth, noteHeight, 8)
    ctx.fill()

    ctx.shadowBlur = 0
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)'
    roundRect(ctx, x + 2, y + 2, noteWidth - 4, 4, 3)
    ctx.fill()
  }
  ctx.globalAlpha = 1
  ctx.shadowBlur = 0
}

function drawRings(ctx: CanvasRenderingContext2D, engine: GameEngine, currentTime: number) {
  for (const ring of engine.rings) {
    const age = currentTime - ring.time
    const progress = age / ring.duration
    if (progress >= 1) continue
    const radius = ring.maxRadius * progress
    const alpha = (1 - progress) * 0.8

    ctx.globalAlpha = alpha
    ctx.strokeStyle = ring.color
    ctx.lineWidth = 3 * (1 - progress * 0.5)
    ctx.shadowColor = ring.color
    ctx.shadowBlur = 12
    ctx.beginPath()
    ctx.arc(ring.x, ring.y, radius, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
  ctx.shadowBlur = 0
}

function drawParticles(ctx: CanvasRenderingContext2D, engine: GameEngine) {
  for (const p of engine.particles) {
    const alpha = p.life / p.maxLife
    ctx.globalAlpha = alpha
    ctx.fillStyle = p.color
    ctx.shadowColor = p.color
    ctx.shadowBlur = 6
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
  ctx.shadowBlur = 0
}

function drawJudgmentText(
  ctx: CanvasRenderingContext2D,
  engine: GameEngine,
  currentTime: number,
  cfg: RenderConfig,
) {
  const text = engine.texts[engine.texts.length - 1]
  if (!text) return
  const age = currentTime - text.time
  if (age >= text.duration) return

  let scale: number
  let alpha: number
  if (age < 0.12) {
    const t = age / 0.12
    scale = 0.7 + 0.5 * easeOutBack(t)
    alpha = t
  } else if (age < 0.4) {
    scale = 1.2 - 0.2 * ((age - 0.12) / 0.28)
    alpha = 1
  } else {
    const t = (age - 0.4) / 0.2
    scale = 1 - 0.1 * t
    alpha = 1 - t
  }

  const centerX = (cfg.laneX[0]! + cfg.laneX[3]!) / 2
  const y = cfg.hitY - 50

  ctx.save()
  ctx.translate(centerX, y)
  ctx.scale(scale, scale)
  ctx.globalAlpha = alpha
  ctx.font = 'bold 22px ' + getComputedStyle(document.documentElement).getPropertyValue('--font-sans')
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.shadowColor = text.color
  ctx.shadowBlur = 14
  ctx.fillStyle = text.color
  ctx.fillText(text.text, 0, 0)
  ctx.restore()
  ctx.shadowBlur = 0
  ctx.globalAlpha = 1
}

function drawKeyLabels(ctx: CanvasRenderingContext2D, cfg: RenderConfig) {
  ctx.font = 'bold 13px ' + getComputedStyle(document.documentElement).getPropertyValue('--font-mono')
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (let lane = 0; lane < 4; lane++) {
    const x = cfg.laneX[lane]!
    const y = cfg.hitY + 28
    ctx.fillStyle = LANE_COLORS[lane]! + 'aa'
    ctx.fillText(LANE_KEYS[lane]!, x, y)
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + w - radius, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius)
  ctx.lineTo(x + w, y + h - radius)
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h)
  ctx.lineTo(x + radius, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius)
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.closePath()
}

function easeOutBack(t: number): number {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
}
