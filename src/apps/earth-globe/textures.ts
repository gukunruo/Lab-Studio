import * as THREE from 'three'

export interface EarthPalette {
  ocean: string
  oceanDeep: string
  land: string
  landDry: string
  ice: string
  coast: string
  atmosphere: string
  cloudAlpha: number
}

export const DARK_PALETTE: EarthPalette = {
  ocean: '#1a5490',
  oceanDeep: '#0d3b66',
  land: '#4a8c3f',
  landDry: '#c4a04e',
  ice: '#e8f0f5',
  coast: '#0a2d4d',
  atmosphere: '#4a9eff',
  cloudAlpha: 0.5,
}

export const LIGHT_PALETTE: EarthPalette = {
  ocean: '#3b82c4',
  oceanDeep: '#2a5d8f',
  land: '#5ba84f',
  landDry: '#d4ae5e',
  ice: '#f0f5f8',
  coast: '#1a4a6e',
  atmosphere: '#6fb0ff',
  cloudAlpha: 0.55,
}

type LonLat = [number, number]

const CONTINENTS: { name: string; points: LonLat[] }[] = [
  {
    name: 'north-america',
    points: [
      [-168, 65], [-155, 68], [-140, 70], [-125, 70], [-110, 72], [-95, 75], [-80, 76],
      [-65, 70], [-55, 62], [-60, 55], [-70, 50], [-75, 42], [-72, 38], [-78, 32],
      [-82, 26], [-85, 22], [-95, 18], [-100, 22], [-108, 26], [-115, 32], [-118, 38],
      [-124, 42], [-125, 48], [-130, 54], [-140, 58], [-155, 60], [-165, 60],
    ],
  },
  {
    name: 'south-america',
    points: [
      [-78, 10], [-70, 12], [-60, 8], [-52, 0], [-45, -5], [-38, -12], [-35, -22],
      [-42, -32], [-52, -38], [-58, -42], [-65, -48], [-70, -53], [-72, -50], [-70, -40],
      [-72, -30], [-75, -20], [-78, -10], [-80, -5], [-80, 0], [-78, 5],
    ],
  },
  {
    name: 'europe',
    points: [
      [-10, 58], [0, 60], [10, 62], [20, 65], [30, 65], [40, 60], [45, 55], [42, 48],
      [35, 45], [28, 45], [20, 42], [12, 45], [5, 48], [-5, 50], [-10, 55],
    ],
  },
  {
    name: 'africa',
    points: [
      [-15, 35], [-5, 33], [10, 35], [20, 32], [30, 32], [38, 28], [42, 18], [45, 12],
      [50, 10], [52, 5], [48, -2], [42, -10], [38, -18], [32, -28], [25, -34], [18, -34],
      [12, -28], [10, -18], [8, -5], [2, 5], [-5, 12], [-10, 18], [-15, 25], [-18, 30],
    ],
  },
  {
    name: 'asia',
    points: [
      [40, 65], [55, 70], [70, 72], [85, 75], [100, 76], [120, 76], [140, 72], [160, 70],
      [175, 68], [175, 62], [160, 55], [145, 50], [140, 45], [135, 42], [130, 38], [128, 35],
      [125, 30], [120, 25], [115, 22], [110, 20], [105, 18], [100, 15], [98, 10], [95, 16],
      [90, 22], [85, 25], [78, 28], [72, 32], [68, 35], [62, 40], [55, 45], [48, 48], [45, 52],
      [42, 55], [40, 58],
    ],
  },
  {
    name: 'india',
    points: [
      [68, 24], [72, 22], [78, 22], [82, 20], [80, 15], [78, 10], [76, 8], [73, 12], [70, 18],
    ],
  },
  {
    name: 'australia',
    points: [
      [113, -22], [120, -20], [128, -18], [135, -16], [142, -14], [146, -18], [150, -25],
      [148, -32], [142, -38], [135, -38], [128, -34], [120, -32], [115, -30], [113, -26],
    ],
  },
  {
    name: 'greenland',
    points: [
      [-55, 82], [-40, 82], [-25, 80], [-22, 75], [-30, 68], [-42, 62], [-52, 64], [-58, 70],
      [-55, 76],
    ],
  },
  {
    name: 'antarctica',
    points: [
      [-180, -68], [-140, -70], [-100, -72], [-60, -74], [-20, -76], [20, -76], [60, -74],
      [100, -72], [140, -70], [180, -68], [180, -90], [-180, -90],
    ],
  },
]

function lonLatToXY(lon: number, lat: number, w: number, h: number): [number, number] {
  return [((lon + 180) / 360) * w, ((90 - lat) / 180) * h]
}

function shadeColor(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const cl = (v: number) => Math.max(0, Math.min(255, v + amount))
  return `#${cl(r).toString(16).padStart(2, '0')}${cl(g).toString(16).padStart(2, '0')}${cl(b).toString(16).padStart(2, '0')}`
}

function latColor(lat: number, palette: EarthPalette): string {
  const absLat = Math.abs(lat)
  if (absLat > 70) return palette.ice
  if (absLat < 15) return palette.landDry
  return palette.land
}

export function createEarthTexture(palette: EarthPalette, anisotropy = 1): THREE.CanvasTexture {
  const w = 2048
  const h = 1024
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!

  // Ocean base with vertical gradient (poles slightly different)
  const oceanGrad = ctx.createLinearGradient(0, 0, 0, h)
  oceanGrad.addColorStop(0, palette.oceanDeep)
  oceanGrad.addColorStop(0.3, palette.ocean)
  oceanGrad.addColorStop(0.7, palette.ocean)
  oceanGrad.addColorStop(1, palette.oceanDeep)
  ctx.fillStyle = oceanGrad
  ctx.fillRect(0, 0, w, h)

  // Subtle ocean texture bands (latitudinal currents)
  ctx.globalAlpha = 0.06
  for (let lat = -80; lat <= 80; lat += 10) {
    const [, y] = lonLatToXY(0, lat, w, h)
    const bandH = h / 18
    ctx.fillStyle = lat % 20 === 0 ? '#ffffff' : '#000000'
    ctx.fillRect(0, y - bandH / 2, w, bandH)
  }
  ctx.globalAlpha = 1

  // Draw continents
  for (const cont of CONTINENTS) {
    ctx.beginPath()
    cont.points.forEach((p, i) => {
      const [x, y] = lonLatToXY(p[0], p[1], w, h)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.closePath()

    // Fill: sample center latitude for color
    let latSum = 0
    for (const p of cont.points) latSum += p[1]
    const avgLat = latSum / cont.points.length
    ctx.fillStyle = latColor(avgLat, palette)
    ctx.fill()

    // Coastline
    ctx.strokeStyle = palette.coast
    ctx.lineWidth = 3
    ctx.lineJoin = 'round'
    ctx.stroke()

    // Inner latitude color variation (dry near equator, ice near poles)
    ctx.save()
    ctx.clip()
    for (const p of cont.points) {
      const [x, y] = lonLatToXY(p[0], p[1], w, h)
      ctx.fillStyle = latColor(p[1], palette)
      ctx.globalAlpha = 0.45
      ctx.beginPath()
      ctx.arc(x, y, 60, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
    ctx.restore()
  }

  // Scattered islands
  const islands: LonLat[] = [
    [-50, -5], [-45, -12], [150, -10], [155, -25], [170, -45], [105, -5], [110, -8],
    [130, 0], [135, -5], [160, 55], [-30, 65], [-15, 60], [10, 55], [135, 45], [140, 50],
  ]
  for (const [lon, lat] of islands) {
    const [x, y] = lonLatToXY(lon, lat, w, h)
    ctx.fillStyle = latColor(lat, palette)
    ctx.beginPath()
    ctx.arc(x, y, 8 + Math.random() * 8, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = palette.coast
    ctx.lineWidth = 1.5
    ctx.stroke()
  }

  // Ice caps (drawn over everything at poles)
  ctx.fillStyle = palette.ice
  ctx.fillRect(0, 0, w, lonLatToXY(0, 78, w, h)[1])
  ctx.fillRect(0, lonLatToXY(0, -78, w, h)[1], w, h)

  // Hand-painted noise overlay (subtle)
  const img = ctx.getImageData(0, 0, w, h)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const noise = (Math.random() - 0.5) * 10
    d[i] = Math.max(0, Math.min(255, d[i]! + noise))
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1]! + noise))
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2]! + noise))
  }
  ctx.putImageData(img, 0, 0)

  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = anisotropy
  return tex
}

export function createCloudTexture(palette: EarthPalette, anisotropy = 1): THREE.CanvasTexture {
  const w = 2048
  const h = 1024
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!

  ctx.clearRect(0, 0, w, h)

  // Cloud bands: more near equator and mid-latitudes, fewer near poles
  const blobCount = 240
  for (let i = 0; i < blobCount; i++) {
    // Bias latitude toward equator (±50) with mid-latitude clusters
    const latBand = Math.random()
    let lat: number
    if (latBand < 0.3) lat = (Math.random() - 0.5) * 30 // equator
    else if (latBand < 0.7) lat = 30 + Math.random() * 30 * (Math.random() < 0.5 ? -1 : 1) // mid
    else lat = (Math.random() - 0.5) * 140 // spread
    const lon = Math.random() * 360 - 180

    const [x, y] = lonLatToXY(lon, lat, w, h)
    const r = 20 + Math.random() * 60
    const alpha = (0.1 + Math.random() * 0.4) * palette.cloudAlpha

    const grad = ctx.createRadialGradient(x, y, 0, x, y, r)
    grad.addColorStop(0, `rgba(255,255,255,${alpha})`)
    grad.addColorStop(0.6, `rgba(255,255,255,${alpha * 0.5})`)
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }

  // Soft white wisps (elongated) for variety
  ctx.globalCompositeOperation = 'lighter'
  for (let i = 0; i < 60; i++) {
    const lat = (Math.random() - 0.5) * 80
    const lon = Math.random() * 360 - 180
    const [x, y] = lonLatToXY(lon, lat, w, h)
    const r = 30 + Math.random() * 50
    const alpha = 0.08 * palette.cloudAlpha
    ctx.fillStyle = `rgba(255,255,255,${alpha})`
    ctx.beginPath()
    ctx.ellipse(x, y, r * 1.8, r * 0.6, Math.random() * Math.PI, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalCompositeOperation = 'source-over'

  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = anisotropy
  return tex
}

export function createToonGradient(): THREE.CanvasTexture {
  const steps = 8
  const canvas = document.createElement('canvas')
  canvas.width = steps
  canvas.height = 1
  const ctx = canvas.getContext('2d')!

  const colors = ['#1a1a2e', '#2d2d4e', '#4a4a6e', '#6a6a8e', '#8a8aae', '#aaaaae', '#cacaca', '#ffffff']
  for (let i = 0; i < steps; i++) {
    ctx.fillStyle = colors[i]!
    ctx.fillRect(i, 0, 1, 1)
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.minFilter = THREE.NearestFilter
  tex.magFilter = THREE.NearestFilter
  tex.generateMipmaps = false
  return tex
}

// Moon surface texture (simple cratered look)
export function createMoonTexture(anisotropy = 1): THREE.CanvasTexture {
  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = '#9a9a9a'
  ctx.fillRect(0, 0, size, size)

  // Noise base
  const img = ctx.getImageData(0, 0, size, size)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const v = 140 + (Math.random() - 0.5) * 40
    d[i] = v
    d[i + 1] = v
    d[i + 2] = v - 5
  }
  ctx.putImageData(img, 0, 0)

  // Craters
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * size
    const y = Math.random() * size
    const r = 4 + Math.random() * 20
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r)
    grad.addColorStop(0, 'rgba(60,60,60,0.6)')
    grad.addColorStop(0.7, 'rgba(120,120,120,0.3)')
    grad.addColorStop(1, 'rgba(180,180,180,0)')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
    // Rim highlight
    ctx.strokeStyle = 'rgba(200,200,200,0.3)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.stroke()
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = anisotropy
  return tex
}

export function shadeHex(hex: string, amount: number): string {
  return shadeColor(hex, amount)
}
