<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'

interface Particle {
  angle: number
  baseRadius: number
  size: number
  speed: number
  twinklePhase: number
  ringIndex: number
}

interface Star {
  x: number
  y: number
  size: number
  phase: number
  brightness: number
}

interface RGB {
  r: number
  g: number
  b: number
}

const props = defineProps<{
  vibeColor: string
  active: boolean
}>()

const canvasEl = ref<HTMLCanvasElement | null>(null)
let ctx: CanvasRenderingContext2D | null = null
let particles: Particle[] = []
let stars: Star[] = []
let ro: ResizeObserver | null = null
let cw = 0
let ch = 0
let cx = 0
let cy = 0
let scale = 1
let dpr = 1
let rgb: RGB = { r: 45, g: 212, b: 191 }
let rgbTarget: RGB = { r: 45, g: 212, b: 191 }

// smoothed visual params
let pulse = 0
let sizeMul = 1
let speedMul = 1
let twinkleAmp = 0.15
let reducedMotion = false

function hexToRgb(hex: string): RGB {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex.trim())
  if (!m) return { r: 45, g: 212, b: 191 }
  return { r: parseInt(m[1]!, 16), g: parseInt(m[2]!, 16), b: parseInt(m[3]!, 16) }
}

function buildParticles() {
  const rings = [
    { count: 50, rMin: 160, rMax: 200, size: 2.0, speed: 0.004 },
    { count: 70, rMin: 220, rMax: 300, size: 1.5, speed: 0.0028 },
    { count: 60, rMin: 320, rMax: 420, size: 1.2, speed: 0.0018 },
    { count: 60, rMin: 440, rMax: 560, size: 0.9, speed: 0.001 },
  ]
  particles = []
  rings.forEach((ring, ri) => {
    for (let i = 0; i < ring.count; i++) {
      particles.push({
        angle: Math.random() * Math.PI * 2,
        baseRadius: ring.rMin + Math.random() * (ring.rMax - ring.rMin),
        size: ring.size * (0.7 + Math.random() * 0.6),
        speed: ring.speed * (0.7 + Math.random() * 0.6) * (Math.random() < 0.5 ? -1 : 1),
        twinklePhase: Math.random() * Math.PI * 2,
        ringIndex: ri,
      })
    }
  })
}

function buildStars() {
  stars = []
  for (let i = 0; i < 220; i++) {
    stars.push({
      x: Math.random(),
      y: Math.random(),
      size: 0.5 + Math.random() * 1.6,
      phase: Math.random() * Math.PI * 2,
      brightness: 0.15 + Math.random() * 0.75,
    })
  }
}

function resize() {
  const c = canvasEl.value
  if (!c) return
  const parent = c.parentElement
  if (!parent) return
  cw = parent.clientWidth
  ch = parent.clientHeight
  dpr = Math.min(window.devicePixelRatio || 1, 2)
  c.width = Math.max(1, Math.floor(cw * dpr))
  c.height = Math.max(1, Math.floor(ch * dpr))
  c.style.width = cw + 'px'
  c.style.height = ch + 'px'
  if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  cx = cw / 2
  cy = ch / 2
  scale = Math.min(cw, ch) / 900
}

function clearCanvas() {
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, cw, ch)
}

function draw(freqData: Uint8Array<ArrayBuffer> | null) {
  if (!ctx || !props.active) {
    if (ctx && !props.active) clearCanvas()
    return
  }

  // lerp rgb toward target (smooth color transition on track change)
  rgb.r += (rgbTarget.r - rgb.r) * 0.04
  rgb.g += (rgbTarget.g - rgb.g) * 0.04
  rgb.b += (rgbTarget.b - rgb.b) * 0.04
  const r = Math.round(rgb.r)
  const g = Math.round(rgb.g)
  const b = Math.round(rgb.b)

  // compute 4 energy bands from 32 bins
  let subBass = 0
  let bass = 0
  let mid = 0
  let high = 0
  if (freqData && freqData.length >= 32) {
    subBass = (freqData[0]! + freqData[1]!) / 2 / 255
    let s = 0
    for (let i = 2; i <= 5; i++) s += freqData[i]!
    bass = s / 4 / 255
    s = 0
    for (let i = 6; i <= 12; i++) s += freqData[i]!
    mid = s / 7 / 255
    s = 0
    for (let i = 13; i <= 31; i++) s += freqData[i]!
    high = s / 19 / 255
  }

  // smooth params
  const idle = !freqData
  const tPulse = idle ? 0 : subBass
  const tSizeMul = idle ? 1 : 1 + bass * 1.5
  const tSpeedMul = idle ? 1 : 0.5 + mid * 1.5
  const tTwinkle = idle ? 0.15 : high * 0.5
  pulse += (tPulse - pulse) * 0.15
  sizeMul += (tSizeMul - sizeMul) * 0.1
  speedMul += (tSpeedMul - speedMul) * 0.1
  twinkleAmp += (tTwinkle - twinkleAmp) * 0.1

  const time = performance.now()

  // dark space background
  ctx.fillStyle = '#0a0a0c'
  ctx.fillRect(0, 0, cw, ch)

  // 1. background starfield (static twinkle)
  for (let i = 0; i < stars.length; i++) {
    const st = stars[i]!
    const tw = reducedMotion ? 1 : 0.65 + Math.sin(time * 0.0012 + st.phase) * 0.35
    const a = st.brightness * tw
    ctx.fillStyle = `rgba(255,255,255,${a})`
    ctx.fillRect(st.x * cw, st.y * ch, st.size, st.size)
  }

  // 2. outer diffuse halo around the central body
  ctx.globalCompositeOperation = 'lighter'
  const outerR = (210 + pulse * 70) * scale
  const og = ctx.createRadialGradient(cx, cy, 0, cx, cy, outerR)
  og.addColorStop(0, `rgba(${r},${g},${b},${0.22 + pulse * 0.2})`)
  og.addColorStop(0.45, `rgba(${r},${g},${b},0.07)`)
  og.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = og
  ctx.fillRect(cx - outerR, cy - outerR, outerR * 2, outerR * 2)

  // 3. orbital rings (saturn-like, tilted, slowly rotating)
  const ringRot = reducedMotion ? 0 : time * 0.00008
  for (let i = 0; i < 3; i++) {
    const rr = (175 + i * 55 + pulse * 35) * scale
    const ry = rr * (0.28 + i * 0.04)
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(ringRot + i * 0.42)
    ctx.strokeStyle = `rgba(${r},${g},${b},${0.1 + pulse * 0.18})`
    ctx.lineWidth = 1 + (2 - i) * 0.4
    ctx.beginPath()
    ctx.ellipse(0, 0, rr, ry, 0, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
  }

  // 4. light rays radiating from core, driven by sub-bass
  if (pulse > 0.06) {
    const rayLen = (170 + pulse * 240) * scale
    const rayCount = 10
    for (let i = 0; i < rayCount; i++) {
      const ang = (i / rayCount) * Math.PI * 2 + time * 0.00018
      const ex = cx + Math.cos(ang) * rayLen
      const ey = cy + Math.sin(ang) * rayLen
      const rg = ctx.createLinearGradient(cx, cy, ex, ey)
      rg.addColorStop(0, `rgba(${r},${g},${b},${0.28 * pulse})`)
      rg.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.strokeStyle = rg
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(ex, ey)
      ctx.stroke()
    }
  }

  // 5. inner core glow (the "planet")
  const coreR = (95 + pulse * 55) * scale
  const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR)
  cg.addColorStop(0, `rgba(${r},${g},${b},${0.5 + pulse * 0.4})`)
  cg.addColorStop(0.6, `rgba(${r},${g},${b},${0.18})`)
  cg.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = cg
  ctx.fillRect(cx - coreR, cy - coreR, coreR * 2, coreR * 2)

  // 6. orbital particles
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i]!
    if (!reducedMotion) {
      p.angle += p.speed * speedMul * (1 + mid * 1.5)
    }
    const radius = (p.baseRadius + pulse * 30) * scale
    const x = cx + Math.cos(p.angle) * radius
    const y = cy + Math.sin(p.angle) * radius

    const ringDim = 1 - p.ringIndex * 0.12
    const twinkle = 1 + Math.sin(time * 0.003 + p.twinklePhase) * twinkleAmp
    const brightness = Math.max(0.18, (0.62 + mid * 0.4) * ringDim * twinkle)
    const size = p.size * sizeMul * scale

    const grad = ctx.createRadialGradient(x, y, 0, x, y, size * 3.5)
    grad.addColorStop(0, `rgba(${r},${g},${b},${brightness})`)
    grad.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = grad
    ctx.fillRect(x - size * 3.5, y - size * 3.5, size * 7, size * 7)
  }

  ctx.globalCompositeOperation = 'source-over'
}

defineExpose({ draw })

watch(
  () => props.vibeColor,
  (hex) => {
    rgbTarget = hexToRgb(hex)
  },
  { immediate: true },
)

onMounted(() => {
  const c = canvasEl.value
  if (!c) return
  ctx = c.getContext('2d')
  reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  buildParticles()
  buildStars()
  resize()
  rgb = { ...rgbTarget }
  ro = new ResizeObserver(() => resize())
  const parent = c.parentElement
  if (parent) ro.observe(parent)
})

onUnmounted(() => {
  ro?.disconnect()
  ro = null
  ctx = null
})
</script>

<template>
  <canvas
    ref="canvasEl"
    class="universe"
    :class="{ 'universe--hidden': !active }"
  ></canvas>
</template>

<style scoped>
.universe {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
}

.universe--hidden {
  opacity: 0;
}
</style>
