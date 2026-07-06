import * as THREE from 'three'
import type { Landmark } from './landmarks'

export interface LandmarkModel {
  group: THREE.Group
  tipMesh: THREE.Mesh
  geometries: THREE.BufferGeometry[]
  materials: THREE.Material[]
}

const GRAD = new THREE.Color(0x222222)

function toonMat(
  color: number,
  gradientMap: THREE.CanvasTexture,
  matList: THREE.Material[],
  emissive?: number,
  emissiveIntensity = 0,
): THREE.MeshToonMaterial {
  const mat = new THREE.MeshToonMaterial({
    color,
    gradientMap,
    emissive: emissive !== undefined ? new THREE.Color(emissive) : GRAD,
    emissiveIntensity: emissive !== undefined ? emissiveIntensity : 0,
  })
  matList.push(mat)
  return mat
}

function addMesh(
  group: THREE.Group,
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  x: number,
  y: number,
  z: number,
  geomList: THREE.BufferGeometry[],
): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, mat)
  mesh.position.set(x, y, z)
  group.add(mesh)
  geomList.push(geo)
  return mesh
}

// ──────────────────────────────────────────────
// 1. Statue of Liberty
// ──────────────────────────────────────────────
function buildStatueOfLiberty(
  group: THREE.Group,
  g: THREE.BufferGeometry[],
  m: THREE.Material[],
  grad: THREE.CanvasTexture,
): void {
  const gray = toonMat(0x8a8a8a, grad, m)
  const copper = toonMat(0x5cb8a0, grad, m)
  const gold = toonMat(0xffd700, grad, m, 0xffaa00, 0.6)

  // Star base (11-point fort)
  addMesh(group, new THREE.CylinderGeometry(0.028, 0.032, 0.012, 11), gray, 0, 0.006, 0, g)
  // Pedestal
  addMesh(group, new THREE.BoxGeometry(0.026, 0.025, 0.026), gray, 0, 0.0245, 0, g)
  // Robe
  addMesh(group, new THREE.CylinderGeometry(0.008, 0.014, 0.045, 8), copper, 0, 0.06, 0, g)
  // Head
  addMesh(group, new THREE.SphereGeometry(0.007, 12, 12), copper, 0, 0.088, 0, g)
  // Crown spikes
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2
    addMesh(group, new THREE.ConeGeometry(0.0015, 0.007, 4), copper, Math.cos(a) * 0.006, 0.094, Math.sin(a) * 0.006, g)
  }
  // Right arm (raised)
  const arm = addMesh(group, new THREE.CylinderGeometry(0.002, 0.0025, 0.032, 6), copper, 0.006, 0.083, 0, g)
  arm.rotation.z = -0.15
  // Torch handle
  addMesh(group, new THREE.CylinderGeometry(0.0018, 0.0018, 0.008, 6), copper, 0.01, 0.102, 0, g)
  // Torch flame
  addMesh(group, new THREE.ConeGeometry(0.005, 0.012, 8), gold, 0.012, 0.114, 0, g)
  // Left arm + tablet
  const la = addMesh(group, new THREE.CylinderGeometry(0.002, 0.0025, 0.022, 6), copper, -0.012, 0.075, 0, g)
  la.rotation.z = 0.4
  addMesh(group, new THREE.BoxGeometry(0.01, 0.012, 0.002), copper, -0.019, 0.073, 0, g)
}

// ──────────────────────────────────────────────
// 2. Eiffel Tower
// ──────────────────────────────────────────────
function buildEiffelTower(
  group: THREE.Group,
  g: THREE.BufferGeometry[],
  m: THREE.Material[],
  grad: THREE.CanvasTexture,
): void {
  const iron = toonMat(0x8b5e3c, grad, m)
  const dark = toonMat(0x6b4423, grad, m)

  // 4 legs (angled inward)
  const legPos: [number, number][] = [[1, 1], [-1, 1], [1, -1], [-1, -1]]
  for (const [sx, sz] of legPos) {
    const leg = addMesh(group, new THREE.BoxGeometry(0.005, 0.04, 0.005), iron, sx * 0.006, 0.02, sz * 0.006, g)
    leg.rotation.x = sz > 0 ? -0.15 : 0.15
    leg.rotation.z = sx > 0 ? -0.15 : 0.15
  }
  // Platform 1
  addMesh(group, new THREE.BoxGeometry(0.022, 0.004, 0.022), dark, 0, 0.04, 0, g)
  // Mid section (tapered)
  addMesh(group, new THREE.CylinderGeometry(0.006, 0.01, 0.03, 4), iron, 0, 0.058, 0, g)
  // Platform 2
  addMesh(group, new THREE.BoxGeometry(0.014, 0.003, 0.014), dark, 0, 0.076, 0, g)
  // Upper section
  addMesh(group, new THREE.CylinderGeometry(0.003, 0.006, 0.025, 4), iron, 0, 0.092, 0, g)
  // Platform 3
  addMesh(group, new THREE.BoxGeometry(0.008, 0.002, 0.008), dark, 0, 0.107, 0, g)
  // Antenna
  addMesh(group, new THREE.CylinderGeometry(0.0015, 0.003, 0.015, 6), iron, 0, 0.118, 0, g)
  // Spire
  addMesh(group, new THREE.ConeGeometry(0.002, 0.008, 6), iron, 0, 0.13, 0, g)
}

// ──────────────────────────────────────────────
// 3. Great Wall
// ──────────────────────────────────────────────
function buildGreatWall(
  group: THREE.Group,
  g: THREE.BufferGeometry[],
  m: THREE.Material[],
  grad: THREE.CanvasTexture,
): void {
  const stone = toonMat(0x9a9588, grad, m)
  const dark = toonMat(0x7a7568, grad, m)

  // Wall segments along a gentle curve
  const segs = [
    { x: -0.02, z: 0.004, rot: 0.1 },
    { x: -0.007, z: 0.006, rot: 0.15 },
    { x: 0.006, z: 0.006, rot: -0.05 },
    { x: 0.019, z: 0.004, rot: -0.12 },
  ]
  for (const s of segs) {
    const wall = addMesh(group, new THREE.BoxGeometry(0.016, 0.014, 0.006), stone, s.x, 0.007, s.z, g)
    wall.rotation.y = s.rot
    // Battlements
    for (let j = -1; j <= 1; j++) {
      const batt = addMesh(group, new THREE.BoxGeometry(0.003, 0.004, 0.006), dark, s.x, 0.016, s.z, g)
      batt.rotation.y = s.rot
    }
  }
  // 2 watchtowers
  const towers: [number, number][] = [[-0.018, 0.004], [0.018, 0.004]]
  for (const [x, z] of towers) {
    addMesh(group, new THREE.BoxGeometry(0.012, 0.025, 0.012), stone, x, 0.0125, z, g)
    const roof = addMesh(group, new THREE.ConeGeometry(0.009, 0.01, 4), dark, x, 0.03, z, g)
    roof.rotation.y = Math.PI / 4
  }
}

// ──────────────────────────────────────────────
// 4. Sydney Opera House
// ──────────────────────────────────────────────
function buildSydneyOperaHouse(
  group: THREE.Group,
  g: THREE.BufferGeometry[],
  m: THREE.Material[],
  grad: THREE.CanvasTexture,
): void {
  const shell = toonMat(0xf5f5f0, grad, m)
  const base = toonMat(0x6b6b6b, grad, m)

  // Water platform
  addMesh(group, new THREE.BoxGeometry(0.05, 0.008, 0.03), base, 0, 0.004, 0, g)

  // Sails — half-spheres tilted
  const sails = [
    { x: -0.018, s: 1.0, t: 0.35 },
    { x: -0.009, s: 1.2, t: 0.2 },
    { x: 0, s: 1.4, t: 0.05 },
    { x: 0.009, s: 1.2, t: -0.15 },
    { x: 0.018, s: 1.0, t: -0.3 },
  ]
  for (const sail of sails) {
    const s = addMesh(
      group,
      new THREE.SphereGeometry(0.014, 16, 10, 0, Math.PI * 0.7, 0, Math.PI * 0.5),
      shell,
      sail.x,
      0.014,
      0,
      g,
    )
    s.scale.set(sail.s, sail.s * 0.7, sail.s * 0.5)
    s.rotation.z = sail.t
  }
}

// ──────────────────────────────────────────────
// 5. Pyramids of Giza
// ──────────────────────────────────────────────
function buildPyramids(
  group: THREE.Group,
  g: THREE.BufferGeometry[],
  m: THREE.Material[],
  grad: THREE.CanvasTexture,
): void {
  const sand = toonMat(0xd4a849, grad, m)
  const dark = toonMat(0xb8902f, grad, m)

  // Great Pyramid (Khufu)
  const khufu = addMesh(group, new THREE.ConeGeometry(0.028, 0.05, 4), sand, 0, 0.025, 0, g)
  khufu.rotation.y = Math.PI / 4
  // Khafre (medium)
  const khafre = addMesh(group, new THREE.ConeGeometry(0.022, 0.038, 4), sand, -0.04, 0.019, 0.005, g)
  khafre.rotation.y = Math.PI / 4
  // Menkaure (small)
  const menk = addMesh(group, new THREE.ConeGeometry(0.016, 0.028, 4), sand, 0.035, 0.014, 0.01, g)
  menk.rotation.y = Math.PI / 4
  // Sphinx (simplified)
  addMesh(group, new THREE.BoxGeometry(0.016, 0.006, 0.008), dark, 0.012, 0.003, -0.018, g)
  addMesh(group, new THREE.BoxGeometry(0.005, 0.006, 0.005), dark, 0.018, 0.009, -0.018, g)
}

// ──────────────────────────────────────────────
// 6. Taj Mahal
// ──────────────────────────────────────────────
function buildTajMahal(
  group: THREE.Group,
  g: THREE.BufferGeometry[],
  m: THREE.Material[],
  grad: THREE.CanvasTexture,
): void {
  const marble = toonMat(0xf0ede5, grad, m)
  const dark = toonMat(0xd0cdc5, grad, m)

  // Base platform
  addMesh(group, new THREE.BoxGeometry(0.05, 0.008, 0.04), dark, 0, 0.004, 0, g)
  // Main building
  addMesh(group, new THREE.BoxGeometry(0.022, 0.025, 0.022), marble, 0, 0.022, 0, g)
  // Main dome (half-sphere)
  addMesh(group, new THREE.SphereGeometry(0.012, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), marble, 0, 0.042, 0, g)
  // Dome spire
  addMesh(group, new THREE.ConeGeometry(0.002, 0.01, 6), dark, 0, 0.058, 0, g)
  // 2 small domes
  for (const x of [-0.014, 0.014]) {
    addMesh(group, new THREE.SphereGeometry(0.005, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), marble, x, 0.035, 0, g)
  }
  // 4 minarets
  const minarets: [number, number][] = [[0.022, 0.014], [-0.022, 0.014], [0.022, -0.014], [-0.022, -0.014]]
  for (const [x, z] of minarets) {
    addMesh(group, new THREE.CylinderGeometry(0.002, 0.0035, 0.045, 6), marble, x, 0.0225, z, g)
    addMesh(group, new THREE.SphereGeometry(0.003, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.5), marble, x, 0.047, z, g)
  }
}

// ──────────────────────────────────────────────
// 7. Christ the Redeemer
// ──────────────────────────────────────────────
function buildChristRedeemer(
  group: THREE.Group,
  g: THREE.BufferGeometry[],
  m: THREE.Material[],
  grad: THREE.CanvasTexture,
): void {
  const stone = toonMat(0xe8e8e8, grad, m)
  const dark = toonMat(0xc8c8c8, grad, m)

  // Base
  addMesh(group, new THREE.BoxGeometry(0.02, 0.012, 0.02), dark, 0, 0.006, 0, g)
  // Robe
  addMesh(group, new THREE.CylinderGeometry(0.006, 0.012, 0.035, 8), stone, 0, 0.03, 0, g)
  // Torso
  addMesh(group, new THREE.BoxGeometry(0.012, 0.018, 0.008), stone, 0, 0.05, 0, g)
  // Head
  addMesh(group, new THREE.SphereGeometry(0.006, 12, 12), stone, 0, 0.065, 0, g)
  // Arms (outstretched horizontally)
  addMesh(group, new THREE.BoxGeometry(0.032, 0.005, 0.004), stone, 0, 0.052, 0, g)
  // Hands
  for (const x of [-0.017, 0.017]) {
    addMesh(group, new THREE.BoxGeometry(0.003, 0.004, 0.003), stone, x, 0.052, 0, g)
  }
}

// ──────────────────────────────────────────────
// 8. Big Ben
// ──────────────────────────────────────────────
function buildBigBen(
  group: THREE.Group,
  g: THREE.BufferGeometry[],
  m: THREE.Material[],
  grad: THREE.CanvasTexture,
): void {
  const stone = toonMat(0xc4a868, grad, m)
  const dark = toonMat(0xa08848, grad, m)
  const gold = toonMat(0xffd700, grad, m, 0xffaa00, 0.5)

  // Main tower
  addMesh(group, new THREE.BoxGeometry(0.014, 0.06, 0.014), stone, 0, 0.03, 0, g)
  // Clock section
  addMesh(group, new THREE.BoxGeometry(0.017, 0.014, 0.017), dark, 0, 0.068, 0, g)
  // 4 clock faces
  const faces: [number, number, number][] = [
    [0, 0, 0.0086],
    [0, 0, -0.0086],
    [0.0086, 0, 0],
    [-0.0086, 0, 0],
  ]
  for (const [x, , z] of faces) {
    const f = addMesh(group, new THREE.CylinderGeometry(0.005, 0.005, 0.001, 16), gold, x, 0.068, z, g)
    f.rotation.x = Math.PI / 2
    if (z !== 0) f.rotation.y = Math.PI / 2
  }
  // Belfry
  addMesh(group, new THREE.BoxGeometry(0.013, 0.008, 0.013), stone, 0, 0.079, 0, g)
  // Spire base
  const sb = addMesh(group, new THREE.ConeGeometry(0.008, 0.012, 4), dark, 0, 0.09, 0, g)
  sb.rotation.y = Math.PI / 4
  // Spire tip
  addMesh(group, new THREE.ConeGeometry(0.003, 0.014, 6), stone, 0, 0.105, 0, g)
}

// ──────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────
export function createLandmarkModel(
  landmark: Landmark,
  gradientMap: THREE.CanvasTexture,
): LandmarkModel {
  const group = new THREE.Group()
  const geometries: THREE.BufferGeometry[] = []
  const materials: THREE.Material[] = []

  const args = [group, geometries, materials, gradientMap] as const

  switch (landmark.id) {
    case 'statue-of-liberty':
      buildStatueOfLiberty(...args)
      break
    case 'eiffel-tower':
      buildEiffelTower(...args)
      break
    case 'great-wall':
      buildGreatWall(...args)
      break
    case 'sydney-opera-house':
      buildSydneyOperaHouse(...args)
      break
    case 'pyramids-of-giza':
      buildPyramids(...args)
      break
    case 'taj-mahal':
      buildTajMahal(...args)
      break
    case 'christ-the-redeemer':
      buildChristRedeemer(...args)
      break
    case 'big-ben':
      buildBigBen(...args)
      break
    default: {
      // Fallback: simple obelisk
      const mat = toonMat(0x8a8a8a, gradientMap, materials)
      addMesh(group, new THREE.BoxGeometry(0.01, 0.06, 0.01), mat, 0, 0.03, 0, geometries)
      addMesh(group, new THREE.ConeGeometry(0.008, 0.015, 4), mat, 0, 0.075, 0, geometries)
    }
  }

  // Invisible bounding sphere for raycast detection
  const tipGeo = new THREE.SphereGeometry(0.05, 8, 8)
  const tipMat = new THREE.MeshBasicMaterial({ visible: false })
  const tipMesh = new THREE.Mesh(tipGeo, tipMat)
  tipMesh.position.y = 0.05
  geometries.push(tipGeo)
  materials.push(tipMat)

  return { group, tipMesh, geometries, materials }
}
