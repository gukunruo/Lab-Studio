import type { Difficulty, Note, Lane } from './types'
import { DIFFICULTY_THRESHOLD } from './types'

export async function loadAudio(src: string): Promise<AudioBuffer> {
  const res = await fetch(src)
  const arr = await res.arrayBuffer()
  const w = window as unknown as { webkitAudioContext?: typeof AudioContext }
  const AC = window.AudioContext || w.webkitAudioContext
  if (!AC) throw new Error('Web Audio API not supported')
  const tmpCtx = new AC()
  const buffer = await tmpCtx.decodeAudioData(arr)
  tmpCtx.close()
  return buffer
}

export function generateChart(buffer: AudioBuffer, difficulty: Difficulty): Note[] {
  const data = buffer.getChannelData(0)
  const sampleRate = buffer.sampleRate
  const duration = buffer.duration
  const threshold = DIFFICULTY_THRESHOLD[difficulty]

  const bassData = new Float32Array(data.length)
  const trebleData = new Float32Array(data.length)
  let bassPrev = 0
  const alpha = 0.1
  for (let i = 0; i < data.length; i++) {
    const d = data[i]!
    bassPrev = bassPrev + alpha * (d - bassPrev)
    bassData[i] = bassPrev
    trebleData[i] = d - bassPrev
  }

  const windowSize = 1024
  const hopSize = 512
  const numWindows = Math.max(0, Math.floor((data.length - windowSize) / hopSize))

  const bassEnergy = new Float32Array(numWindows)
  const trebleEnergy = new Float32Array(numWindows)

  for (let w = 0; w < numWindows; w++) {
    const start = w * hopSize
    let be = 0
    let te = 0
    for (let i = 0; i < windowSize; i++) {
      const b = bassData[start + i]!
      const t = trebleData[start + i]!
      be += b * b
      te += t * t
    }
    bassEnergy[w] = be / windowSize
    trebleEnergy[w] = te / windowSize
  }

  const lookback = Math.max(1, Math.ceil(0.2 / (hopSize / sampleRate)))
  const bassOnsets: number[] = []
  const trebleOnsets: number[] = []

  for (let w = lookback; w < numWindows - 1; w++) {
    const time = (w * hopSize) / sampleRate

    let bassAvg = 0
    for (let j = w - lookback; j < w; j++) bassAvg += bassEnergy[j]!
    bassAvg /= lookback
    if (
      bassEnergy[w]! > bassAvg * threshold &&
      bassEnergy[w]! > bassEnergy[w - 1]! &&
      bassEnergy[w]! >= bassEnergy[w + 1]!
    ) {
      bassOnsets.push(time)
    }

    let trebleAvg = 0
    for (let j = w - lookback; j < w; j++) trebleAvg += trebleEnergy[j]!
    trebleAvg /= lookback
    if (
      trebleEnergy[w]! > trebleAvg * threshold &&
      trebleEnergy[w]! > trebleEnergy[w - 1]! &&
      trebleEnergy[w]! >= trebleEnergy[w + 1]!
    ) {
      trebleOnsets.push(time)
    }
  }

  const notes: Note[] = []
  let noteId = 0
  let bassLaneToggle = 0
  let trebleLaneToggle = 2

  for (const time of bassOnsets) {
    notes.push({ id: noteId++, time, lane: bassLaneToggle as Lane, hit: false, missed: false })
    bassLaneToggle = bassLaneToggle === 0 ? 1 : 0
  }
  for (const time of trebleOnsets) {
    notes.push({ id: noteId++, time, lane: trebleLaneToggle as Lane, hit: false, missed: false })
    trebleLaneToggle = trebleLaneToggle === 2 ? 3 : 2
  }

  notes.sort((a, b) => a.time - b.time)

  const minGap = difficulty === 'easy' ? 0.5 : difficulty === 'normal' ? 0.35 : 0.2
  const maxDensity = difficulty === 'easy' ? 1 : difficulty === 'normal' ? 1 : 2
  const filtered: Note[] = []
  const lastNoteTime: number[] = [-Infinity, -Infinity, -Infinity, -Infinity]
  const recentTimes: number[] = []

  for (const note of notes) {
    if (note.time < 1.5 || note.time > duration - 1) continue
    if (note.time - lastNoteTime[note.lane]! < minGap) continue

    while (recentTimes.length > 0 && note.time - recentTimes[0]! > 0.12) {
      recentTimes.shift()
    }
    if (recentTimes.length >= maxDensity) continue

    filtered.push(note)
    lastNoteTime[note.lane] = note.time
    recentTimes.push(note.time)
  }

  return filtered
}

export function gradeFromAccuracy(accuracy: number): string {
  if (accuracy > 0.95) return 'S'
  if (accuracy > 0.85) return 'A'
  if (accuracy > 0.7) return 'B'
  if (accuracy > 0.55) return 'C'
  return 'D'
}
