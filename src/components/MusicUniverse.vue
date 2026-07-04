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

  // dark space background with subtle vibe tint
  ctx.fillStyle = '#0a0a0c'
  ctx.fillRect(0, 0, cw, ch)

  // central sun glow driven by sub-bass
  const sunR = (120 + pulse * 80) * scale
  const sunGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, sunR)
  const sunAlpha = 0.35 + pulse * 0.4
  sunGrad.addColorStop(0, `rgba(${Math.round(rgb.r)},${Math.round(rgb.g)},${Math.round(rgb.b)},${sunAlpha})`)
  sunGrad.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = sunGrad
  ctx.fillRect(cx - sunR, cy - sunR, sunR * 2, sunR * 2)

  ctx.globalCompositeOperation = 'lighter'

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
    const brightness = Math.max(0.15, (0.6 + mid * 0.4) * ringDim * twinkle)
    const size = p.size * sizeMul * scale

    const grad = ctx.createRadialGradient(x, y, 0, x, y, size * 3.5)
    grad.addColorStop(0, `rgba(${Math.round(rgb.r)},${Math.round(rgb.g)},${Math.round(rgb.b)},${brightness})`)
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
