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
      [-168, 66], [-162, 71], [-156, 71], [-148, 70.5], [-140, 70], [-133, 70.5],
      [-125, 71.5], [-117, 73], [-108, 74], [-100, 74.5], [-92, 75], [-84, 73.5],
      [-78, 76], [-72, 77], [-68, 73], [-65, 67], [-60, 60], [-53, 53],
      [-59, 47], [-66, 44.5], [-70, 42], [-74, 40], [-75.5, 37.5], [-77, 34],
      [-79, 32], [-80, 28], [-80, 25], [-82.5, 24.5], [-82.5, 28], [-85, 30],
      [-89, 30], [-94, 30], [-97, 26], [-99, 22], [-96, 18], [-92, 18],
      [-90, 19], [-87, 21], [-86, 21], [-87, 18], [-88, 16], [-86, 13],
      [-83, 11], [-82, 8.5], [-79, 9.5], [-81, 7], [-84, 11], [-87, 13],
      [-89, 14], [-92, 15], [-95, 16], [-98, 16], [-103, 18], [-107, 23],
      [-110, 23], [-114, 27], [-115.5, 30], [-117, 32.5], [-118, 34],
      [-120.5, 34.5], [-121.8, 36.5], [-122.5, 37.8], [-124, 40], [-124, 44],
      [-124, 48], [-128, 52], [-132, 55], [-136, 58], [-141, 60], [-148, 60],
      [-153, 58], [-158, 57], [-162, 55], [-168, 56], [-168, 66],
    ],
  },
  {
    name: 'south-america',
    points: [
      [-77, 12], [-72, 11], [-68, 11.5], [-62, 10.5], [-57, 6], [-52, 5],
      [-50, 1], [-48, -2], [-43, -8], [-35, -7], [-35, -9], [-37, -12],
      [-39, -15], [-38.5, -19], [-42, -23], [-48, -27.5], [-53, -33],
      [-58, -38], [-62, -41], [-65, -43], [-66, -45], [-67, -50],
      [-70, -52.5], [-72, -54.5], [-74, -53], [-72, -50], [-73, -47],
      [-74, -43], [-74, -37], [-72, -33], [-71.5, -30], [-71, -27],
      [-70, -23], [-70, -18], [-72, -14], [-76, -10], [-80, -6],
      [-81, -2.5], [-80.5, 1], [-78.5, 3], [-77, 6], [-77, 12],
    ],
  },
  {
    name: 'europe',
    points: [
      [5, 71], [15, 71], [25, 70.5], [35, 69], [45, 68], [55, 67],
      [60, 65], [60, 50], [50, 46], [44, 45], [40, 43], [37, 44.5],
      [33, 45.5], [30, 46], [28, 45], [28, 41], [27, 37.5], [24, 35.5],
      [22, 37], [20, 39.5], [18.5, 40], [18.2, 39], [16, 37.5],
      [12.5, 38], [10.5, 43.5], [7.5, 43.8], [3.5, 43.5], [0, 42.5],
      [-2, 36.8], [-5, 36], [-9, 36.5], [-9.5, 38.5], [-8.5, 42],
      [-7.5, 43.5], [-2, 43.5], [-1, 48.5], [2, 51], [5, 53.5],
      [9, 54.5], [11, 55.5], [14, 56], [18, 57.5], [18, 62], [20, 65.5],
      [24, 66], [28, 65], [30, 62], [28, 60], [23, 60], [18, 59.5],
      [14, 58], [10, 58], [7, 58], [5, 60], [7, 63], [5, 65.5],
      [10, 65], [13, 68], [16, 69.5], [10, 70], [5, 71],
    ],
  },
  {
    name: 'africa',
    points: [
      [-10, 35], [-6, 35.5], [0, 35], [5, 37], [11, 34], [16, 32],
      [22, 31.5], [25, 32], [31, 31.5], [32, 31], [34, 28], [37, 18],
      [43, 12.5], [46, 11], [51, 12], [51.5, 8], [50, 4], [48, 0],
      [44, -1], [41, -3], [40, -6], [40, -11], [40.5, -16], [40, -20],
      [40.5, -25], [35.5, -30], [32, -30], [27, -33], [20, -34.5],
      [16, -29], [12, -20], [11.5, -13], [10, -7], [9.5, -2], [9, 2],
      [9.5, 4.5], [3.5, 6], [-1, 5], [-3, 5], [-8, 4.5], [-10, 7],
      [-13, 9], [-16, 13], [-17, 16.5], [-16, 20.5], [-13, 23],
      [-12, 28], [-10, 35],
    ],
  },
  {
    name: 'asia',
    points: [
      [60, 65], [70, 72], [85, 75], [100, 76], [115, 77], [130, 76],
      [140, 73], [145, 71], [155, 70], [163, 68], [170, 67], [175, 66],
      [175, 62], [170, 60], [163, 58], [155, 56], [148, 52], [142, 49],
      [140, 46], [141, 43], [140, 40], [135, 42], [132, 38], [129, 35],
      [126, 33], [122, 30], [121, 25], [118, 22], [110, 20], [105, 18],
      [100, 14], [98, 10], [96, 5], [95, 2], [97, 5], [100, 10],
      [103, 12], [108, 11], [110, 13], [112, 18], [116, 23], [122, 30],
      [126, 33], [129, 35], [132, 38], [136, 42], [140, 45], [142, 49],
      [140, 52], [135, 55], [130, 56], [127, 53], [123, 53], [120, 50],
      [122, 46], [127, 44], [130, 43], [128, 40], [120, 40], [112, 41],
      [105, 41], [97, 43], [88, 45], [80, 43], [72, 40], [68, 38],
      [68, 25], [70, 22], [75, 25], [78, 19], [76, 9], [80, 8],
      [80, 13], [85, 20], [90, 22], [90, 25], [82, 28], [75, 30],
      [70, 32], [62, 40], [55, 45], [50, 48], [55, 55], [60, 65],
    ],
  },
  {
    name: 'australia',
    points: [
      [113, -22], [115, -19], [118, -17.5], [122, -16], [127, -14],
      [131, -12], [136, -12], [140, -11], [142, -10.5], [142.5, -12],
      [146, -19], [147, -19.5], [150, -24], [153, -27], [150, -35],
      [146, -38.5], [142, -38.5], [138, -35.5], [134, -33], [129, -32],
      [127, -32], [122, -34], [115, -34.5], [113, -26], [113, -22],
    ],
  },
  {
    name: 'greenland',
    points: [
      [-55, 83], [-30, 83], [-22, 80], [-22, 76], [-27, 72], [-32, 70],
      [-37, 62], [-43, 60], [-46, 60.5], [-49, 64], [-53, 68],
      [-55, 73], [-58, 76], [-55, 83],
    ],
  },
  {
    name: 'antarctica',
    points: [
      [-180, -68], [-160, -70], [-140, -72], [-120, -74], [-100, -75],
      [-80, -74], [-60, -78], [-40, -78], [-20, -75], [0, -70],
      [20, -69], [40, -67], [60, -67], [80, -67], [100, -66],
      [120, -67], [140, -67], [160, -73], [180, -78], [180, -90],
      [-180, -90],
    ],
  },
  // --- Islands ---
  {
    name: 'great-britain',
    points: [
      [-5.5, 50], [-1, 51], [1.5, 52.5], [1.5, 55], [-2, 58],
      [-3, 58.5], [-5, 58], [-5.5, 56], [-3, 55], [-5, 53],
      [-5.5, 50],
    ],
  },
  {
    name: 'ireland',
    points: [
      [-10, 52], [-6, 52], [-6, 55.5], [-10, 55.5], [-10, 52],
    ],
  },
  {
    name: 'japan-hokkaido',
    points: [
      [140, 42], [145, 43.5], [146, 45], [142, 45.5], [140, 44],
      [140, 42],
    ],
  },
  {
    name: 'japan-honshu',
    points: [
      [131, 31.5], [134, 33], [136, 34.5], [139, 35.5], [141, 37],
      [141.5, 41], [140, 41], [136, 36], [132, 34], [131, 31.5],
    ],
  },
  {
    name: 'madagascar',
    points: [
      [43, -12], [50, -13], [50.5, -16], [49, -21], [47, -25],
      [44, -25.5], [43, -22], [43.5, -18], [43, -12],
    ],
  },
  {
    name: 'new-zealand-north',
    points: [
      [173, -34.5], [175, -36], [178, -37.5], [177.5, -39.5],
      [174, -41.5], [173, -39], [173, -34.5],
    ],
  },
  {
    name: 'new-zealand-south',
    points: [
      [167, -41], [174, -41], [174.5, -44], [170, -46.5], [167, -46],
      [166.5, -44], [167, -41],
    ],
  },
  {
    name: 'sumatra',
    points: [
      [95, 5.5], [102, 0.5], [106, -2], [103.5, -5.5], [100, -5.5],
      [97, -1], [95, 5.5],
    ],
  },
  {
    name: 'java',
    points: [
      [105, -6.5], [109, -7], [114, -7.5], [114.5, -8.5], [112, -8.5],
      [108, -7.5], [105, -7], [105, -6.5],
    ],
  },
  {
    name: 'borneo',
    points: [
      [109.5, 2], [114, 4.5], [118.5, 5.5], [119.5, 2], [117.5, -1],
      [114, -3.5], [110.5, -3.5], [109.5, 2],
    ],
  },
  {
    name: 'sulawesi',
    points: [
      [119.5, 1.5], [124.5, 1.5], [124, -3], [121, -5.5], [120, -5.5],
      [120, -2], [119.5, 1.5],
    ],
  },
  {
    name: 'iceland',
    points: [
      [-24, 64], [-13, 64], [-13.5, 66.5], [-23, 66.5], [-24, 64],
    ],
  },
  {
    name: 'sri-lanka',
    points: [
      [80, 8], [82, 7], [82, 9.5], [81, 10], [80, 8],
    ],
  },
  {
    name: 'philippines-luzon',
    points: [
      [120, 13.5], [122, 16], [122.5, 18.5], [120.5, 18.5], [120, 13.5],
    ],
  },
  {
    name: 'philippines-mindanao',
    points: [
      [124, 7], [126.5, 8], [126.5, 10], [124, 10], [124, 7],
    ],
  },
  {
    name: 'cuba',
    points: [
      [-85, 22], [-80, 22.5], [-74, 20.5], [-74.5, 21.5], [-83, 23],
      [-85, 22],
    ],
  },
  {
    name: 'hispaniola',
    points: [
      [-74, 17.5], [-68, 18], [-68.5, 19.5], [-72, 19.5], [-74, 17.5],
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
  if (absLat < 25) return shadeColor(palette.land, -10)
  return palette.land
}

export function createEarthTexture(palette: EarthPalette, anisotropy = 1): THREE.CanvasTexture {
  const w = 2048
  const h = 1024
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!

  // Ocean base with subtle vertical gradient (poles darker)
  const oceanGrad = ctx.createLinearGradient(0, 0, 0, h)
  oceanGrad.addColorStop(0, palette.oceanDeep)
  oceanGrad.addColorStop(0.15, palette.ocean)
  oceanGrad.addColorStop(0.5, palette.ocean)
  oceanGrad.addColorStop(0.85, palette.ocean)
  oceanGrad.addColorStop(1, palette.oceanDeep)
  ctx.fillStyle = oceanGrad
  ctx.fillRect(0, 0, w, h)

  // Very subtle ocean texture (latitudinal current hints, barely visible)
  ctx.globalAlpha = 0.03
  for (let lat = -80; lat <= 80; lat += 15) {
    const [, y] = lonLatToXY(0, lat, w, h)
    const bandH = h / 22
    ctx.fillStyle = lat % 30 === 0 ? '#ffffff' : '#000000'
    ctx.fillRect(0, y - bandH / 2, w, bandH)
  }
  ctx.globalAlpha = 1

  // Draw continents and islands
  for (const cont of CONTINENTS) {
    ctx.beginPath()
    cont.points.forEach((p, i) => {
      const [x, y] = lonLatToXY(p[0], p[1], w, h)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.closePath()

    // Fill: sample average latitude for color
    let latSum = 0
    for (const p of cont.points) latSum += p[1]
    const avgLat = latSum / cont.points.length
    ctx.fillStyle = latColor(avgLat, palette)
    ctx.fill()

    // Coastline (thinner for cleaner look with more detail)
    ctx.strokeStyle = palette.coast
    ctx.lineWidth = 2
    ctx.lineJoin = 'round'
    ctx.stroke()

    // Inner latitude color variation (dry near equator, ice near poles)
    ctx.save()
    ctx.clip()
    for (const p of cont.points) {
      const [x, y] = lonLatToXY(p[0], p[1], w, h)
      ctx.fillStyle = latColor(p[1], palette)
      ctx.globalAlpha = 0.4
      ctx.beginPath()
      ctx.arc(x, y, 45, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
    ctx.restore()
  }

  // Scattered small islands (reduced count to avoid clashing with new island polygons)
  const islands: LonLat[] = [
    [-50, -5], [-45, -12], [160, 55], [-30, 65], [-15, 60], [10, 55],
    [135, 45], [140, 50], [160, -45], [170, -25], [105, -5], [110, -8],
    [130, 0], [135, -5], [177, -18], [-171, -14], [166, 47],
  ]
  for (const [lon, lat] of islands) {
    const [x, y] = lonLatToXY(lon, lat, w, h)
    ctx.fillStyle = latColor(lat, palette)
    ctx.beginPath()
    ctx.arc(x, y, 5 + (lon * 7 + lat * 3) % 6, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = palette.coast
    ctx.lineWidth = 1
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
    const noise = (Math.random() - 0.5) * 6
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
