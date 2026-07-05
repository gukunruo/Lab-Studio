<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { usePlayerStore } from '@/stores/player'
import { loadAudio, generateChart } from './chart'
import { GameEngine } from './engine'
import { render, type RenderConfig } from './render'
import type { Difficulty, Lane, GameResult, Note } from './types'
import { LANE_KEY_CODES, DIFFICULTY_LABELS } from './types'
import { PhPlay, PhPause } from '@phosphor-icons/vue'

defineOptions({ name: 'RhythmGameIndex' })

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
    const layout = computeLayout()
    engine = new GameEngine(chart, { laneX: layout.laneX, hitY: layout.hitY })
    cfg = {
      width: layout.width,
      height: layout.height,
      laneX: layout.laneX,
      laneWidth: layout.laneWidth,
      hitY: layout.hitY,
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
  if (gameState.value !== 'playing') {
    if (e.code === 'Escape' && gameState.value === 'results') {
      gameState.value = 'select'
    }
    return
  }
  if (e.code === 'Escape') {
    quitGame()
    return
  }
  const lane = LANE_KEY_CODES[e.code]
  if (lane === undefined || e.repeat || !gameCtx || !engine) return
  const currentTime = gameCtx.currentTime - startTime
  engine.onHit(lane as Lane, currentTime)
}

function onTouchLane(lane: Lane) {
  if (gameState.value !== 'playing' || !gameCtx || !engine) return
  const currentTime = gameCtx.currentTime - startTime
  engine.onHit(lane, currentTime)
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

function onResize() {
  if (!engine || !cfg) return
  const layout = computeLayout()
  engine.setConfig({ laneX: layout.laneX, hitY: layout.hitY })
  cfg.width = layout.width
  cfg.height = layout.height
  cfg.laneX = layout.laneX
  cfg.laneWidth = layout.laneWidth
  cfg.hitY = layout.hitY
  if (canvasRef.value) {
    const ctx = setupCanvas()
    if (ctx && engine) {
      render(ctx, engine, currentTimeRef.value, cfg)
    }
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('resize', onResize)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
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
      <div class="rg__header">
        <h1 class="rg__title">节奏游戏</h1>
        <p class="rg__subtitle">选择一首歌曲,跟随节拍敲击 D F J K</p>
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
    <div v-else-if="gameState === 'analyzing'" class="rg__analyzing">
      <div class="rg__spinner" />
      <p class="rg__analyzing-text">分析音频中...</p>
    </div>

    <!-- Game Screen (countdown + playing) -->
    <template v-else>
      <canvas ref="canvasRef" class="rg__canvas" />

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
        <button class="rg__pause" @click="togglePause">
          <PhPause v-if="!isPaused" :size="20" weight="fill" />
          <PhPlay v-else :size="20" weight="fill" />
        </button>
        <div v-if="isPaused" class="rg__paused-overlay" @click="togglePause">
          <div class="rg__paused-text">已暂停</div>
          <button class="rg__quit-btn" @click.stop="quitGame">退出</button>
        </div>
      </div>

      <!-- Results Screen -->
      <div v-if="gameState === 'results' && result" class="rg__results">
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

/* Select Screen */
.rg__select {
  height: 100%;
  overflow-y: auto;
  padding: var(--space-8) var(--space-6) var(--space-16);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-6);
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
.rg__analyzing {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-6);
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

.rg__analyzing-text {
  color: var(--color-text-muted);
  font-size: 0.95rem;
}

/* Canvas */
.rg__canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

/* Countdown */
.rg__countdown {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
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
  top: var(--space-6);
  left: 0;
  right: 0;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 0 var(--space-6);
}

.rg__score {
  font-family: var(--font-mono);
  font-size: 1.4rem;
  font-weight: 700;
  color: #ffffff;
  text-shadow: 0 0 12px rgba(255, 255, 255, 0.3);
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
}

.rg__pause {
  position: absolute;
  top: var(--space-6);
  right: var(--space-6);
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 1px solid var(--color-border);
  background: rgba(15, 15, 17, 0.8);
  color: #ffffff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: auto;
  transition: all 0.2s;

  &:hover {
    border-color: var(--vibe);
    color: var(--vibe);
  }
}

.rg__paused-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(8px);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-6);
  pointer-events: auto;
  cursor: pointer;
}

.rg__paused-text {
  font-size: 2rem;
  font-weight: 700;
  color: #ffffff;
}

.rg__quit-btn {
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
  animation: resultsIn 0.4s ease-out;
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
}
</style>
