<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { usePlayerStore } from '@/stores/player'
import { loadAudio, generateChart } from './chart'
import { GameEngine } from './engine'
import { render, type RenderConfig } from './render'
import type { Difficulty, Lane, GameResult, Note } from './types'
import { LANE_KEY_CODES, DIFFICULTY_LABELS } from './types'
import { PhPlay, PhPause, PhArrowLeft, PhHouse } from '@phosphor-icons/vue'

defineOptions({ name: 'RhythmGameIndex' })

const router = useRouter()
const player = usePlayerStore()

type GameState = 'select' | 'analyzing' | 'countdown' | 'playing' | 'results'
const gameState = ref<GameState>('select')
const difficulty = ref<Difficulty>('normal')

const canvasRef = ref<HTMLCanvasElement | null>(null)
const score = ref(0)
const combo = ref(0)
const accuracy = ref(0)
const progress = ref(0)
const result = ref<GameResult | null>(null)
const currentTimeRef = ref(0)
const error = ref('')
const noteCount = ref(0)
const keyPressed = ref([false, false, false, false])
const currentTrack = ref<{ title: string; artist: string; cover: string } | null>(null)

const vibePalette = ['#2dd4bf', '#f59e0b', '#ec4899', '#8b5cf6', '#3b82f6', '#ef4444', '#10b981', '#f97316']
const vibe = ref('#2dd4bf')

let gameCtx: AudioContext | null = null
let sourceNode: AudioBufferSourceNode | null = null
let audioBuffer: AudioBuffer | null = null
let startTime = 0
let engine: GameEngine | null = null
let raf = 0
let chart: Note[] = []
let cfg: RenderConfig | null = null
let isPaused = false

const difficulties: Difficulty[] = ['easy', 'normal', 'hard']

const countdownDisplay = computed(() => {
  if (gameState.value !== 'countdown') return ''
  const t = currentTimeRef.value
  if (t > -0.4) return 'GO!'
  return String(Math.max(1, Math.ceil(-t)))
})

const trackList = computed(() => player.playlist)

const timeDisplay = computed(() => {
  if (!audioBuffer) return '0:00'
  const t = Math.max(0, Math.min(audioBuffer.duration, currentTimeRef.value))
  return formatDuration(t) + ' / ' + formatDuration(audioBuffer.duration)
})

const layout = ref(computeLayout())

function getVibeColor(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return vibePalette[h % vibePalette.length] ?? '#2dd4bf'
}

function formatDuration(s: number): string {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}

function computeLayout() {
  const width = window.innerWidth
  const height = window.innerHeight
  const totalWidth = Math.min(width * 0.5, 480)
  const laneWidth = totalWidth / 4
  const leftEdge = (width - totalWidth) / 2
  const laneX = [0, 1, 2, 3].map((i) => leftEdge + laneWidth * (i + 0.5))
  const hitY = height * 0.82
  return { width, height, laneX, laneWidth, hitY }
}

async function startGame(trackId: string) {
  const track = player.playlist.find((t) => t.id === trackId)
  if (!track) return
  error.value = ''
  vibe.value = getVibeColor(track.id)
  currentTrack.value = { title: track.title, artist: track.artist, cover: track.cover }
  if (player.isPlaying) player.pause()
  gameState.value = 'analyzing'

  try {
    audioBuffer = await loadAudio(track.src)
    await nextTick()
    chart = generateChart(audioBuffer, difficulty.value)
    if (chart.length < 5) {
      error.value = '这首歌曲的节拍太少,试试其他歌曲'
      gameState.value = 'select'
      return
    }
    noteCount.value = chart.length
    startCountdown()
  } catch {
    error.value = '音频加载失败,请尝试其他歌曲'
    gameState.value = 'select'
  }
}

function startCountdown() {
  gameState.value = 'countdown'
  gameCtx = new AudioContext()
  gameCtx.resume()
  sourceNode = gameCtx.createBufferSource()
  sourceNode.buffer = audioBuffer
  sourceNode.connect(gameCtx.destination)
  startTime = gameCtx.currentTime + 3
  sourceNode.start(startTime)
  sourceNode.onended = () => {
    if (gameState.value === 'playing') {
      endGame()
    }
  }
  setupGameLoop()
}

function setupCanvas() {
  const canvas = canvasRef.value
  if (!canvas) return null
  const dpr = window.devicePixelRatio || 1
  const w = window.innerWidth
  const h = window.innerHeight
  canvas.width = w * dpr
  canvas.height = h * dpr
  canvas.style.width = w + 'px'
  canvas.style.height = h + 'px'
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return ctx
}

function setupGameLoop() {
  nextTick(() => {
    const ctx = setupCanvas()
    if (!ctx) return
    layout.value = computeLayout()
    engine = new GameEngine(chart, { laneX: layout.value.laneX, hitY: layout.value.hitY })
    cfg = {
      width: layout.value.width,
      height: layout.value.height,
      laneX: layout.value.laneX,
      laneWidth: layout.value.laneWidth,
      hitY: layout.value.hitY,
      approachTime: 2,
      vibe: vibe.value,
    }

    function loop() {
      if (!gameCtx || !engine || !cfg || !audioBuffer) return
      const currentTime = gameCtx.currentTime - startTime
      currentTimeRef.value = currentTime

      if (gameState.value === 'countdown' && currentTime >= 0) {
        gameState.value = 'playing'
      }

      if (!isPaused) {
        engine.update(currentTime)
        score.value = engine.score
        combo.value = engine.combo
        accuracy.value = engine.getAccuracy()
        progress.value = Math.max(0, Math.min(1, currentTime / audioBuffer.duration))
      }

      render(ctx!, engine, currentTime, cfg)

      if (engine.isFinished(currentTime, audioBuffer.duration)) {
        endGame()
        return
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
  })
}

function onKeyDown(e: KeyboardEvent) {
  if (e.code === 'Escape') {
    if (gameState.value === 'playing' || gameState.value === 'countdown') {
      e.preventDefault()
      e.stopImmediatePropagation()
      quitGame()
    } else if (gameState.value === 'results') {
      e.preventDefault()
      e.stopImmediatePropagation()
      gameState.value = 'select'
    }
    return
  }

  if (e.code === 'Space' && gameState.value === 'playing') {
    e.preventDefault()
    e.stopImmediatePropagation()
    togglePause()
    return
  }

  if (gameState.value !== 'playing') return

  const lane = LANE_KEY_CODES[e.code]
  if (lane === undefined) return

  e.preventDefault()
  e.stopImmediatePropagation()

  if (e.repeat || !gameCtx || !engine) return
  const currentTime = gameCtx.currentTime - startTime
  keyPressed.value[lane] = true
  engine.laneFlash[lane] = currentTime
  engine.onHit(lane as Lane, currentTime)
}

function onKeyUp(e: KeyboardEvent) {
  const lane = LANE_KEY_CODES[e.code]
  if (lane === undefined) return
  keyPressed.value[lane] = false
}

function onTouchLane(lane: Lane) {
  if (gameState.value !== 'playing' || !gameCtx || !engine) return
  const currentTime = gameCtx.currentTime - startTime
  keyPressed.value[lane] = true
  engine.laneFlash[lane] = currentTime
  engine.onHit(lane, currentTime)
  setTimeout(() => {
    keyPressed.value[lane] = false
  }, 80)
}

function endGame() {
  cancelAnimationFrame(raf)
  if (sourceNode) {
    try {
      sourceNode.stop()
    } catch {}
  }
  if (engine && audioBuffer) {
    result.value = engine.getResult(audioBuffer.duration)
  }
  gameState.value = 'results'
}

function playAgain() {
  if (!audioBuffer || chart.length === 0) return
  result.value = null
  score.value = 0
  combo.value = 0
  accuracy.value = 0
  progress.value = 0
  keyPressed.value = [false, false, false, false]
  try {
    gameCtx?.close()
  } catch {}
  gameCtx = null
  startCountdown()
}

function quitGame() {
  cancelAnimationFrame(raf)
  if (sourceNode) {
    try {
      sourceNode.stop()
    } catch {}
  }
  try {
    gameCtx?.close()
  } catch {}
  gameCtx = null
  sourceNode = null
  engine = null
  cfg = null
  isPaused = false
  keyPressed.value = [false, false, false, false]
  gameState.value = 'select'
}

function togglePause() {
  if (!gameCtx) return
  if (isPaused) {
    isPaused = false
    gameCtx.resume()
  } else {
    isPaused = true
    gameCtx.suspend()
  }
}

function navigateHome() {
  quitGame()
  router.push('/')
}

function onResize() {
  layout.value = computeLayout()
  if (!engine || !cfg) return
  engine.setConfig({ laneX: layout.value.laneX, hitY: layout.value.hitY })
  cfg.width = layout.value.width
  cfg.height = layout.value.height
  cfg.laneX = layout.value.laneX
  cfg.laneWidth = layout.value.laneWidth
  cfg.hitY = layout.value.hitY
  if (canvasRef.value) {
    const ctx = setupCanvas()
    if (ctx && engine) {
      render(ctx, engine, currentTimeRef.value, cfg)
    }
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown, { capture: true })
  window.addEventListener('keyup', onKeyUp, { capture: true })
  window.addEventListener('resize', onResize)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown, { capture: true } as EventListenerOptions)
  window.removeEventListener('keyup', onKeyUp, { capture: true } as EventListenerOptions)
  window.removeEventListener('resize', onResize)
  cancelAnimationFrame(raf)
  if (sourceNode) {
    try {
      sourceNode.stop()
    } catch {}
  }
  try {
    gameCtx?.close()
  } catch {}
})
</script>

<template>
  <div class="rg" :style="{ '--vibe': vibe }">
    <!-- Select Screen -->
    <div v-if="gameState === 'select'" class="rg__select">
      <div class="rg__select-top">
        <button class="rg__home-btn" @click="navigateHome">
          <PhArrowLeft :size="16" weight="bold" />
          返回
        </button>
      </div>

      <div class="rg__header">
        <h1 class="rg__title">节奏游戏</h1>
        <p class="rg__subtitle">选择一首歌曲，跟随节拍敲击 D F J K</p>
      </div>

      <div class="rg__diff">
        <button
          v-for="d in difficulties"
          :key="d"
          class="rg__diff-btn"
          :class="{ 'rg__diff-btn--active': difficulty === d }"
          @click="difficulty = d"
        >
          {{ DIFFICULTY_LABELS[d].zh }}
        </button>
      </div>

      <p v-if="error" class="rg__error">{{ error }}</p>

      <div class="rg__songs">
        <button
          v-for="track in trackList"
          :key="track.id"
          class="rg__song"
          @click="startGame(track.id)"
        >
          <img class="rg__song-cover" :src="track.cover" :alt="track.title" loading="lazy" />
          <div class="rg__song-info">
            <div class="rg__song-title">{{ track.title }}</div>
            <div class="rg__song-artist">{{ track.artist }}</div>
          </div>
        </button>
      </div>
    </div>

    <!-- Analyzing Screen -->
    <div v-else-if="gameState === 'analyzing'" class="rg__overlay">
      <div class="rg__spinner" />
      <p class="rg__overlay-text">分析音频中...</p>
      <button class="rg__overlay-back" @click="quitGame">取消</button>
    </div>

    <!-- Game Screen (countdown + playing) -->
    <template v-else>
      <canvas ref="canvasRef" class="rg__canvas" />

      <!-- Touch lanes (always present during countdown + playing) -->
      <div v-if="gameState === 'playing' && !isPaused" class="rg__touch-lanes">
        <div
          v-for="(x, i) in layout.laneX"
          :key="i"
          class="rg__touch-lane"
          :class="{ 'rg__touch-lane--pressed': keyPressed[i] }"
          :style="{
            left: (x - layout.laneWidth / 2) + 'px',
            width: layout.laneWidth + 'px',
          }"
          @pointerdown="onTouchLane(i as Lane)"
        />
      </div>

      <!-- Song info (top-left, always visible) -->
      <div v-if="currentTrack && (gameState === 'countdown' || gameState === 'playing')" class="rg__track-info">
        <img class="rg__track-cover" :src="currentTrack.cover" :alt="currentTrack.title" />
        <div class="rg__track-text">
          <div class="rg__track-title">{{ currentTrack.title }}</div>
          <div class="rg__track-artist">{{ currentTrack.artist }}</div>
        </div>
      </div>

      <!-- Exit button (top-right, always visible) -->
      <button
        v-if="gameState === 'countdown' || gameState === 'playing'"
        class="rg__exit-btn"
        @click="quitGame"
        title="退出 (ESC)"
      >
        <PhHouse :size="18" weight="bold" />
      </button>

      <!-- Countdown Overlay -->
      <div v-if="gameState === 'countdown'" class="rg__countdown">
        <span :key="countdownDisplay" class="rg__countdown-num">{{ countdownDisplay }}</span>
      </div>

      <!-- Playing HUD -->
      <div v-if="gameState === 'playing'" class="rg__hud">
        <div class="rg__progress">
          <div class="rg__progress-fill" :style="{ width: progress * 100 + '%' }" />
        </div>
        <div class="rg__hud-top">
          <div class="rg__score">{{ score.toLocaleString() }}</div>
          <div class="rg__combo" :class="{ 'rg__combo--pop': combo > 0 }">
            <span class="rg__combo-num">{{ combo }}</span>
            <span class="rg__combo-label">COMBO</span>
          </div>
          <div class="rg__acc">{{ (accuracy * 100).toFixed(1) }}%</div>
        </div>
        <div class="rg__time">{{ timeDisplay }}</div>
        <button class="rg__pause" @click="togglePause">
          <PhPause v-if="!isPaused" :size="18" weight="fill" />
          <PhPlay v-else :size="18" weight="fill" />
        </button>
        <div v-if="isPaused" class="rg__paused-overlay" @click="togglePause">
          <div class="rg__paused-text">已暂停</div>
          <div class="rg__paused-hint">点击继续 · 空格暂停/继续</div>
          <button class="rg__quit-btn" @click.stop="quitGame">退出游戏</button>
        </div>
      </div>

      <!-- Results Screen -->
      <div v-if="gameState === 'results' && result" class="rg__results">
        <div class="rg__results-back">
          <button class="rg__home-btn" @click="navigateHome">
            <PhArrowLeft :size="16" weight="bold" />
            返回
          </button>
        </div>
        <div class="rg__grade" :style="{ color: vibe }">{{ result.grade }}</div>
        <div v-if="result.fullCombo" class="rg__fc">FULL COMBO!</div>
        <div class="rg__stats">
          <div class="rg__stat">
            <div class="rg__stat-value">{{ result.score.toLocaleString() }}</div>
            <div class="rg__stat-label">得分</div>
          </div>
          <div class="rg__stat">
            <div class="rg__stat-value">{{ result.maxCombo }}</div>
            <div class="rg__stat-label">最大连击</div>
          </div>
          <div class="rg__stat">
            <div class="rg__stat-value">{{ (result.accuracy * 100).toFixed(1) }}%</div>
            <div class="rg__stat-label">准确度</div>
          </div>
        </div>
        <div class="rg__judgments">
          <div class="rg__j rg__j--perfect">Perfect {{ result.judgments.perfect }}</div>
          <div class="rg__j rg__j--great">Great {{ result.judgments.great }}</div>
          <div class="rg__j rg__j--good">Good {{ result.judgments.good }}</div>
          <div class="rg__j rg__j--miss">Miss {{ result.judgments.miss }}</div>
        </div>
        <div class="rg__result-actions">
          <button class="rg__btn rg__btn--primary" @click="playAgain">再来一次</button>
          <button class="rg__btn rg__btn--secondary" @click="quitGame">换首歌</button>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped lang="scss">
.rg {
  position: fixed;
  inset: 0;
  background: #0f0f11;
  color: var(--color-text);
  overflow: hidden;
  z-index: 100;
}

/* Shared */
.rg__home-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0.45rem 0.9rem;
  font-size: 0.82rem;
  font-family: var(--font-mono);
  font-weight: 600;
  color: var(--color-text-muted);
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    color: var(--color-text);
    border-color: var(--color-border-strong);
  }
}

/* Select Screen */
.rg__select {
  height: 100%;
  overflow-y: auto;
  padding: var(--space-4) var(--space-6) var(--space-16);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-6);
}

.rg__select-top {
  width: 100%;
  max-width: 600px;
  display: flex;
  justify-content: flex-start;
}

.rg__header {
  text-align: center;
}

.rg__title {
  font-size: 2rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  margin: 0;
  background: linear-gradient(135deg, var(--vibe), #ffffff);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}

.rg__subtitle {
  color: var(--color-text-muted);
  font-size: 0.9rem;
  margin: var(--space-2) 0 0;
}

.rg__diff {
  display: flex;
  gap: var(--space-2);
}

.rg__diff-btn {
  padding: 0.5rem 1.2rem;
  font-size: 0.85rem;
  font-weight: 600;
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text-muted);
  border-radius: var(--radius-full);
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    border-color: var(--color-border-strong);
    color: var(--color-text);
  }

  &--active {
    background: var(--vibe);
    color: #0f0f11;
    border-color: var(--vibe);
  }
}

.rg__error {
  color: #f87171;
  font-size: 0.85rem;
}

.rg__songs {
  width: 100%;
  max-width: 600px;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.rg__song {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  cursor: pointer;
  transition: all 0.2s;
  text-align: left;

  &:hover {
    border-color: var(--vibe);
    background: var(--color-surface-2);
    transform: translateX(4px);
  }
}

.rg__song-cover {
  width: 44px;
  height: 44px;
  border-radius: var(--radius-sm);
  object-fit: cover;
  flex-shrink: 0;
}

.rg__song-info {
  min-width: 0;
}

.rg__song-title {
  font-weight: 600;
  font-size: 0.95rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rg__song-artist {
  font-size: 0.8rem;
  color: var(--color-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Analyzing */
.rg__overlay {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-4);
}

.rg__spinner {
  width: 40px;
  height: 40px;
  border: 3px solid var(--color-border);
  border-top-color: var(--vibe);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.rg__overlay-text {
  color: var(--color-text-muted);
  font-size: 0.95rem;
}

.rg__overlay-back {
  margin-top: var(--space-2);
  padding: 0.4rem 1rem;
  font-size: 0.82rem;
  color: var(--color-text-muted);
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  cursor: pointer;

  &:hover {
    color: var(--color-text);
    border-color: var(--color-border-strong);
  }
}

/* Canvas */
.rg__canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

/* Touch lanes */
.rg__touch-lanes {
  position: absolute;
  inset: 0;
  pointer-events: auto;
  z-index: 1;
}

.rg__touch-lane {
  position: absolute;
  top: 0;
  bottom: 0;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
  transition: background 0.05s;

  &--pressed {
    background: rgba(255, 255, 255, 0.03);
  }
}

/* Track info */
.rg__track-info {
  position: absolute;
  top: var(--space-5);
  left: var(--space-6);
  display: flex;
  align-items: center;
  gap: var(--space-3);
  z-index: 2;
  pointer-events: none;
  max-width: 280px;
}

.rg__track-cover {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-sm);
  object-fit: cover;
  flex-shrink: 0;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
}

.rg__track-text {
  min-width: 0;
}

.rg__track-title {
  font-size: 0.85rem;
  font-weight: 600;
  color: #ffffff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
}

.rg__track-artist {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.6);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Exit button */
.rg__exit-btn {
  position: absolute;
  top: var(--space-5);
  right: var(--space-6);
  width: 38px;
  height: 38px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(15, 15, 17, 0.7);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 3;
  transition: all 0.2s;

  &:hover {
    border-color: rgba(255, 255, 255, 0.3);
    color: #ffffff;
    background: rgba(30, 30, 35, 0.8);
  }
}

/* Countdown */
.rg__countdown {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  z-index: 2;
}

.rg__countdown-num {
  font-size: 7rem;
  font-weight: 900;
  color: var(--vibe);
  text-shadow: 0 0 40px var(--vibe);
  animation: countdownPop 1s ease-out;
}

@keyframes countdownPop {
  0% {
    transform: scale(0.3);
    opacity: 0;
  }
  30% {
    transform: scale(1.1);
    opacity: 1;
  }
  70% {
    transform: scale(1);
    opacity: 1;
  }
  100% {
    transform: scale(0.8);
    opacity: 0;
  }
}

/* HUD */
.rg__hud {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 2;
}

.rg__progress {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: rgba(255, 255, 255, 0.06);
}

.rg__progress-fill {
  height: 100%;
  background: var(--vibe);
  box-shadow: 0 0 8px var(--vibe);
  transition: width 0.1s linear;
}

.rg__hud-top {
  position: absolute;
  top: var(--space-5);
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 0 var(--space-6);
  gap: var(--space-8);
}

.rg__score {
  font-family: var(--font-mono);
  font-size: 1.4rem;
  font-weight: 700;
  color: #ffffff;
  text-shadow: 0 0 12px rgba(255, 255, 255, 0.3);
  min-width: 100px;
  text-align: right;
}

.rg__combo {
  text-align: center;
  transition: transform 0.1s;
}

.rg__combo--pop {
  animation: comboPop 0.15s ease-out;
}

@keyframes comboPop {
  0% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.15);
  }
  100% {
    transform: scale(1);
  }
}

.rg__combo-num {
  display: block;
  font-size: 2.2rem;
  font-weight: 900;
  line-height: 1;
  color: var(--vibe);
  text-shadow: 0 0 20px var(--vibe);
}

.rg__combo-label {
  display: block;
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  color: var(--color-text-muted);
  margin-top: 2px;
}

.rg__acc {
  font-family: var(--font-mono);
  font-size: 1.1rem;
  font-weight: 600;
  color: #ffffff;
  text-shadow: 0 0 10px rgba(255, 255, 255, 0.2);
  min-width: 100px;
  text-align: left;
}

.rg__time {
  position: absolute;
  bottom: var(--space-3);
  left: 50%;
  transform: translateX(-50%);
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.4);
}

.rg__pause {
  position: absolute;
  top: var(--space-5);
  right: calc(var(--space-6) + 50px);
  width: 38px;
  height: 38px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(15, 15, 17, 0.7);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: auto;
  transition: all 0.2s;

  &:hover {
    border-color: rgba(255, 255, 255, 0.3);
    color: #ffffff;
  }
}

.rg__paused-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-4);
  pointer-events: auto;
  cursor: pointer;
}

.rg__paused-text {
  font-size: 2rem;
  font-weight: 700;
  color: #ffffff;
}

.rg__paused-hint {
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.5);
}

.rg__quit-btn {
  margin-top: var(--space-4);
  padding: 0.6rem 1.5rem;
  font-size: 0.9rem;
  font-weight: 600;
  border: 1px solid var(--color-border-strong);
  background: transparent;
  color: var(--color-text);
  border-radius: var(--radius-full);
  cursor: pointer;
  pointer-events: auto;

  &:hover {
    border-color: #f87171;
    color: #f87171;
  }
}

/* Results */
.rg__results {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-4);
  background: rgba(15, 15, 17, 0.92);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  animation: resultsIn 0.4s ease-out;
}

.rg__results-back {
  position: absolute;
  top: var(--space-5);
  left: var(--space-6);
}

@keyframes resultsIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.rg__grade {
  font-size: 7rem;
  font-weight: 900;
  line-height: 1;
  text-shadow: 0 0 60px currentColor;
  animation: gradeIn 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes gradeIn {
  0% {
    transform: scale(0);
    opacity: 0;
  }
  60% {
    transform: scale(1.2);
    opacity: 1;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}

.rg__fc {
  font-size: 0.9rem;
  font-weight: 700;
  letter-spacing: 0.15em;
  color: #fbbf24;
  text-shadow: 0 0 12px #fbbf24;
  animation: fcPulse 1s ease-in-out infinite;
}

@keyframes fcPulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.6;
  }
}

.rg__stats {
  display: flex;
  gap: var(--space-12);
  margin: var(--space-6) 0;
}

.rg__stat {
  text-align: center;
}

.rg__stat-value {
  font-family: var(--font-mono);
  font-size: 1.5rem;
  font-weight: 700;
  color: #ffffff;
}

.rg__stat-label {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  margin-top: 2px;
}

.rg__judgments {
  display: flex;
  gap: var(--space-4);
  font-size: 0.82rem;
  font-weight: 600;
}

.rg__j--perfect {
  color: #fbbf24;
}
.rg__j--great {
  color: #2dd4bf;
}
.rg__j--good {
  color: #3b82f6;
}
.rg__j--miss {
  color: #f87171;
}

.rg__result-actions {
  display: flex;
  gap: var(--space-4);
  margin-top: var(--space-6);
}

.rg__btn {
  padding: 0.7rem 1.6rem;
  font-size: 0.95rem;
  font-weight: 600;
  border-radius: var(--radius-full);
  cursor: pointer;
  transition: all 0.2s;
  border: none;
}

.rg__btn--primary {
  background: var(--vibe);
  color: #0f0f11;

  &:hover {
    filter: brightness(1.1);
  }
}

.rg__btn--secondary {
  background: var(--color-surface-2);
  color: var(--color-text);
  border: 1px solid var(--color-border);

  &:hover {
    border-color: var(--color-border-strong);
  }
}

@media (max-width: 640px) {
  .rg__songs {
    max-width: 100%;
  }

  .rg__grade {
    font-size: 5rem;
  }

  .rg__stats {
    gap: var(--space-6);
  }

  .rg__judgments {
    flex-wrap: wrap;
    justify-content: center;
  }

  .rg__track-info {
    max-width: 180px;
  }

  .rg__hud-top {
    gap: var(--space-4);
  }

  .rg__score,
  .rg__acc {
    min-width: 60px;
    font-size: 1.1rem;
  }

  .rg__combo-num {
    font-size: 1.6rem;
  }
}
</style>
