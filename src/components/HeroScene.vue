<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useThemeStore } from '@/stores/theme'

const canvas = ref<HTMLCanvasElement | null>(null)
const theme = useThemeStore()
const { theme: currentTheme } = storeToRefs(theme)

interface P {
  x: number
  y: number
  vx: number
  vy: number
  r: number
}

let ctx: CanvasRenderingContext2D | null = null
let raf = 0
let running = false
let reduce = false
let particles: P[] = []
let accent = '13, 148, 136'
const mouse = { x: -9999, y: -9999, active: false }
let w = 0
let h = 0
let dpr = 1
let host: HTMLElement | null = null

function readAccent() {
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue('--color-accent-rgb')
    .trim()
  if (v) accent = v
}

function resize() {
  const c = canvas.value
  if (!c) return
  host = c.parentElement
  if (!host) return
  dpr = Math.min(window.devicePixelRatio || 1, 2)
  w = host.clientWidth
  h = host.clientHeight
  c.width = Math.floor(w * dpr)
  c.height = Math.floor(h * dpr)
  c.style.width = w + 'px'
  c.style.height = h + 'px'
  if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  initParticles()
}

function initParticles() {
  const count = Math.min(70, Math.max(26, Math.floor((w * h) / 17000)))
  particles = []
  for (let i = 0; i < count; i++) {
    particles.push({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.18,
      vy: (Math.random() - 0.5) * 0.18,
      r: Math.random() * 1.3 + 0.6,
    })
  }
}

function step() {
  if (!ctx) return
  ctx.clearRect(0, 0, w, h)

  for (const p of particles) {
    p.x += p.vx
    p.y += p.vy
    if (p.x < -24) p.x = w + 24
    else if (p.x > w + 24) p.x = -24
    if (p.y < -24) p.y = h + 24
    else if (p.y > h + 24) p.y = -24
  }

  const maxDist = 128
  const maxDistSq = maxDist * maxDist
  for (let i = 0; i < particles.length; i++) {
    const a = particles[i]
    if (!a) continue
    for (let j = i + 1; j < particles.length; j++) {
      const b = particles[j]
      if (!b) continue
      const dx = a.x - b.x
      const dy = a.y - b.y
      const dSq = dx * dx + dy * dy
      if (dSq < maxDistSq) {
        const dist = Math.sqrt(dSq)
        const alpha = (1 - dist / maxDist) * 0.16
        ctx.strokeStyle = `rgba(${accent}, ${alpha})`
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.stroke()
      }
    }
  }

  if (mouse.active) {
    for (const p of particles) {
      const dx = p.x - mouse.x
      const dy = p.y - mouse.y
      const d = Math.hypot(dx, dy)
      if (d < 170) {
        const alpha = (1 - d / 170) * 0.45
        ctx.strokeStyle = `rgba(${accent}, ${alpha})`
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(p.x, p.y)
        ctx.lineTo(mouse.x, mouse.y)
        ctx.stroke()
      }
    }
    ctx.fillStyle = `rgba(${accent}, 0.65)`
    ctx.beginPath()
    ctx.arc(mouse.x, mouse.y, 2.6, 0, Math.PI * 2)
    ctx.fill()
  }

  for (const p of particles) {
    ctx.fillStyle = `rgba(${accent}, 0.5)`
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
    ctx.fill()
  }

  raf = requestAnimationFrame(step)
}

function drawStatic() {
  if (!ctx) return
  ctx.clearRect(0, 0, w, h)
  for (const p of particles) {
    ctx.fillStyle = `rgba(${accent}, 0.45)`
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
    ctx.fill()
  }
  const maxDist = 128
  for (let i = 0; i < particles.length; i++) {
    const a = particles[i]
    if (!a) continue
    for (let j = i + 1; j < particles.length; j++) {
      const b = particles[j]
      if (!b) continue
      const dx = a.x - b.x
      const dy = a.y - b.y
      const d = Math.hypot(dx, dy)
      if (d < maxDist) {
        const alpha = (1 - d / maxDist) * 0.1
        ctx.strokeStyle = `rgba(${accent}, ${alpha})`
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.stroke()
      }
    }
  }
}

function start() {
  if (running) return
  if (reduce) {
    drawStatic()
    return
  }
  running = true
  raf = requestAnimationFrame(step)
}

function stop() {
  running = false
  cancelAnimationFrame(raf)
}

function onVisibility() {
  if (document.hidden) stop()
  else start()
}

function onMove(e: MouseEvent) {
  const c = canvas.value
  if (!c) return
  const rect = c.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top
  if (x < 0 || y < 0 || x > rect.width || y > rect.height) {
    mouse.active = false
    return
  }
  mouse.x = x
  mouse.y = y
  mouse.active = true
}

function onLeave() {
  mouse.active = false
  mouse.x = -9999
  mouse.y = -9999
}

function onResize() {
  resize()
  if (reduce) drawStatic()
}

onMounted(() => {
  const c = canvas.value
  if (!c) return
  reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  readAccent()
  ctx = c.getContext('2d')
  host = c.parentElement
  resize()
  start()
  window.addEventListener('resize', onResize)
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('mousemove', onMove)
  window.addEventListener('blur', onLeave)
  document.documentElement.addEventListener('mouseleave', onLeave)
})

onUnmounted(() => {
  stop()
  window.removeEventListener('resize', onResize)
  document.removeEventListener('visibilitychange', onVisibility)
  window.removeEventListener('mousemove', onMove)
  window.removeEventListener('blur', onLeave)
  document.documentElement.removeEventListener('mouseleave', onLeave)
})

watch(currentTheme, () => {
  readAccent()
  if (reduce) {
    ctx?.clearRect(0, 0, w, h)
    drawStatic()
  }
})
</script>

<template>
  <canvas ref="canvas" class="hero-scene" aria-hidden="true" />
</template>

<style scoped>
.hero-scene {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  pointer-events: none;
}
</style>
