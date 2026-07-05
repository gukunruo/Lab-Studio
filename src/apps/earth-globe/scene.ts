import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import {
  DARK_PALETTE,
  LIGHT_PALETTE,
  type EarthPalette,
  createCloudTexture,
  createEarthTexture,
  createMoonTexture,
  createToonGradient,
} from './textures'
import { LANDMARKS, latLonToVector3, type Landmark } from './landmarks'

interface SceneConfig {
  starCount: number
  segments: number
  antialias: boolean
}

function detectConfig(): SceneConfig {
  const isMobile = navigator.maxTouchPoints > 0 && window.innerWidth < 768
  return {
    starCount: isMobile ? 4000 : 8000,
    segments: isMobile ? 48 : 64,
    antialias: !isMobile,
  }
}

const EARTH_SPEED = 0.08
const CLOUD_SPEED = 0.12
const MOON_SPEED = 0.15
const STAR_SPEED = 0.003

const PIN_COLOR = 0x2dd4bf
const FOCUS_DISTANCE = 1.8
const ANIM_DURATION = 1.2

interface CameraAnim {
  fromPos: THREE.Vector3
  toPos: THREE.Vector3
  fromTarget: THREE.Vector3
  toTarget: THREE.Vector3
  elapsed: number
  duration: number
  onComplete?: () => void
}

const ATMOSPHERE_VERTEX = `
  varying vec3 vNormal;
  varying vec3 vViewDir;
  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vViewDir = normalize(-mvPosition.xyz);
    gl_Position = projectionMatrix * mvPosition;
  }
`

const ATMOSPHERE_FRAGMENT = `
  uniform vec3 uAtmosphereColor;
  uniform float uIntensity;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  void main() {
    float fresnel = 1.0 - dot(vNormal, vViewDir);
    fresnel = pow(fresnel, 2.5);
    float alpha = fresnel * uIntensity;
    gl_FragColor = vec4(uAtmosphereColor, alpha);
  }
`

export class GlobeScene {
  private renderer: THREE.WebGLRenderer
  private scene: THREE.Scene
  private camera: THREE.PerspectiveCamera
  private controls: OrbitControls
  private timer = new THREE.Timer()
  private rafId = 0
  private disposed = false

  private earthMesh: THREE.Mesh
  private cloudsMesh: THREE.Mesh
  private atmosphereMesh: THREE.Mesh
  private moonOrbit: THREE.Group
  private moonMesh: THREE.Mesh
  private starfield: THREE.Points
  private starfieldMaterial: THREE.PointsMaterial
  private atmosphereMaterial: THREE.ShaderMaterial
  private earthMaterial: THREE.MeshToonMaterial

  private earthTextures: Map<boolean, THREE.CanvasTexture>
  private cloudTextures: Map<boolean, THREE.CanvasTexture>
  private moonTexture: THREE.CanvasTexture
  private toonGradient: THREE.CanvasTexture

  private geometries: THREE.BufferGeometry[] = []
  private materials: THREE.Material[] = []
  private textures: THREE.Texture[] = []

  private darkPalette = DARK_PALETTE
  private lightPalette = LIGHT_PALETTE

  private landmarkGroups: THREE.Group[] = []
  private landmarkTips: THREE.Mesh[] = []
  private tipMaterials: THREE.MeshStandardMaterial[] = []
  private raycaster = new THREE.Raycaster()
  private pointer = new THREE.Vector2()
  private hoveredGroup: THREE.Group | null = null
  private pointerDownPos: { x: number; y: number } | null = null
  private cameraAnim: CameraAnim | null = null
  private frozen = false
  private elapsed = 0

  onHoverLandmark: ((landmark: Landmark | null, screenX: number, screenY: number) => void) | null = null
  onSelectLandmark: ((landmark: Landmark | null) => void) | null = null

  constructor(container: HTMLElement, isDark: boolean) {
    const cfg = detectConfig()
    const w = container.clientWidth || window.innerWidth
    const h = container.clientHeight || window.innerHeight

    this.renderer = new THREE.WebGLRenderer({
      antialias: cfg.antialias,
      alpha: false,
      powerPreference: 'high-performance',
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(w, h)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.0
    container.appendChild(this.renderer.domElement)

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x000814)

    this.camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 1000)
    this.camera.position.set(0, 0.4, 3.2)

    // Lights
    const sun = new THREE.DirectionalLight(0xffffff, 1.2)
    sun.position.set(5, 3, 5)
    this.scene.add(sun)

    const ambient = new THREE.AmbientLight(0x404a5a, 0.4)
    this.scene.add(ambient)

    const rim = new THREE.DirectionalLight(0x6fa8ff, 0.3)
    rim.position.set(-5, 0, -3)
    this.scene.add(rim)

    // Textures (pre-generate both themes)
    const aniso = this.renderer.capabilities.getMaxAnisotropy()
    this.earthTextures = new Map([
      [true, createEarthTexture(this.darkPalette, aniso)],
      [false, createEarthTexture(this.lightPalette, aniso)],
    ])
    this.cloudTextures = new Map([
      [true, createCloudTexture(this.darkPalette, aniso)],
      [false, createCloudTexture(this.lightPalette, aniso)],
    ])
    this.moonTexture = createMoonTexture(aniso)
    this.toonGradient = createToonGradient()
    this.textures.push(...this.earthTextures.values(), ...this.cloudTextures.values(), this.moonTexture, this.toonGradient)

    // Earth
    const earthGeo = new THREE.SphereGeometry(1.0, cfg.segments, cfg.segments)
    this.earthMaterial = new THREE.MeshToonMaterial({
      map: this.earthTextures.get(isDark)!,
      gradientMap: this.toonGradient,
    })
    this.earthMaterial.emissive = new THREE.Color(0x1a3a5a)
    this.earthMaterial.emissiveMap = this.earthTextures.get(isDark)!
    this.earthMaterial.emissiveIntensity = 0.15
    this.earthMesh = new THREE.Mesh(earthGeo, this.earthMaterial)
    this.geometries.push(earthGeo)
    this.materials.push(this.earthMaterial)
    this.scene.add(this.earthMesh)

    // Clouds
    const cloudGeo = new THREE.SphereGeometry(1.015, cfg.segments, cfg.segments)
    const cloudMat = new THREE.MeshBasicMaterial({
      map: this.cloudTextures.get(isDark)!,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.NormalBlending,
    })
    this.cloudsMesh = new THREE.Mesh(cloudGeo, cloudMat)
    this.geometries.push(cloudGeo)
    this.materials.push(cloudMat)
    this.scene.add(this.cloudsMesh)

    // Atmosphere (Fresnel glow)
    const atmGeo = new THREE.SphereGeometry(1.12, cfg.segments, cfg.segments)
    this.atmosphereMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uAtmosphereColor: { value: new THREE.Color(isDark ? this.darkPalette.atmosphere : this.lightPalette.atmosphere) },
        uIntensity: { value: 1.0 },
      },
      vertexShader: ATMOSPHERE_VERTEX,
      fragmentShader: ATMOSPHERE_FRAGMENT,
      transparent: true,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    this.atmosphereMesh = new THREE.Mesh(atmGeo, this.atmosphereMaterial)
    this.geometries.push(atmGeo)
    this.materials.push(this.atmosphereMaterial)
    this.scene.add(this.atmosphereMesh)

    // Moon orbit group
    this.moonOrbit = new THREE.Group()
    this.scene.add(this.moonOrbit)

    const moonGeo = new THREE.SphereGeometry(0.27, 32, 32)
    const moonMat = new THREE.MeshStandardMaterial({
      map: this.moonTexture,
      color: 0xc8c8c8,
      roughness: 0.95,
      metalness: 0.0,
    })
    this.moonMesh = new THREE.Mesh(moonGeo, moonMat)
    this.moonMesh.position.set(2.5, 0, 0)
    this.geometries.push(moonGeo)
    this.materials.push(moonMat)
    this.moonOrbit.add(this.moonMesh)

    // Starfield
    this.starfield = this.createStarfield(cfg.starCount, 50)
    this.scene.add(this.starfield)
    this.starfieldMaterial = this.starfield.material as THREE.PointsMaterial
    this.starfieldMaterial.opacity = isDark ? 0.9 : 0.6

    // Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.05
    this.controls.rotateSpeed = 0.5
    this.controls.zoomSpeed = 0.8
    this.controls.minDistance = 1.6
    this.controls.maxDistance = 8
    this.controls.enablePan = false
    this.controls.autoRotate = true
    this.controls.autoRotateSpeed = 0.5

    // Landmark markers (children of earth so they rotate with it)
    this.createLandmarkMarkers()

    // Pointer interaction
    this.renderer.domElement.addEventListener('pointermove', this.onPointerMove)
    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown)
    this.renderer.domElement.addEventListener('pointerup', this.onPointerUp)
  }

  private createLandmarkMarkers(): void {
    const up = new THREE.Vector3(0, 1, 0)
    for (const lm of LANDMARKS) {
      const group = new THREE.Group()

      // Pin (cylinder pointing outward from surface)
      const pinGeo = new THREE.CylinderGeometry(0.0035, 0.0035, 0.06, 8)
      const pinMat = new THREE.MeshBasicMaterial({ color: PIN_COLOR })
      const pin = new THREE.Mesh(pinGeo, pinMat)
      pin.position.y = 0.03
      group.add(pin)

      // Glowing tip (emissive sphere)
      const tipGeo = new THREE.SphereGeometry(0.018, 16, 16)
      const tipMat = new THREE.MeshStandardMaterial({
        color: PIN_COLOR,
        emissive: PIN_COLOR,
        emissiveIntensity: 0.8,
        roughness: 0.4,
      })
      const tip = new THREE.Mesh(tipGeo, tipMat)
      tip.position.y = 0.06
      group.add(tip)

      // Surface ring (flat on surface)
      const ringGeo = new THREE.RingGeometry(0.024, 0.032, 32)
      const ringMat = new THREE.MeshBasicMaterial({
        color: PIN_COLOR,
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide,
      })
      const ring = new THREE.Mesh(ringGeo, ringMat)
      ring.rotation.x = -Math.PI / 2
      group.add(ring)

      // Position and orient: Y axis points outward from earth center
      const pos = latLonToVector3(lm.lat, lm.lon, 1.0)
      group.position.copy(pos)
      const dir = pos.clone().normalize()
      group.quaternion.setFromUnitVectors(up, dir)

      group.userData.landmark = lm

      this.geometries.push(pinGeo, tipGeo, ringGeo)
      this.materials.push(pinMat, tipMat, ringMat)

      this.earthMesh.add(group)
      this.landmarkGroups.push(group)
      this.landmarkTips.push(tip)
      this.tipMaterials.push(tipMat)
    }
  }

  private createStarfield(count: number, radius: number): THREE.Points {
    const positions = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)

    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      const r = radius * (0.85 + Math.random() * 0.15)
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
      positions[i * 3 + 2] = r * Math.cos(phi)

      const tint = Math.random()
      if (tint < 0.7) {
        colors[i * 3] = 1; colors[i * 3 + 1] = 1; colors[i * 3 + 2] = 1
      } else if (tint < 0.85) {
        colors[i * 3] = 1; colors[i * 3 + 1] = 0.9; colors[i * 3 + 2] = 0.7
      } else {
        colors[i * 3] = 0.7; colors[i * 3 + 1] = 0.85; colors[i * 3 + 2] = 1
      }
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    this.geometries.push(geometry)

    const material = new THREE.PointsMaterial({
      size: 1.5,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    })
    this.materials.push(material)

    return new THREE.Points(geometry, material)
  }

  start(): void {
    if (this.disposed) return
    this.animate()
  }

  private animate = (): void => {
    if (this.disposed) return
    this.rafId = requestAnimationFrame(this.animate)
    this.timer.update()
    const delta = this.timer.getDelta()
    this.elapsed += delta

    if (!this.frozen) {
      this.earthMesh.rotation.y += EARTH_SPEED * delta
      this.cloudsMesh.rotation.y += CLOUD_SPEED * delta
      this.cloudsMesh.rotation.x = 0.02
    }
    this.moonOrbit.rotation.y += MOON_SPEED * delta
    this.starfield.rotation.y += STAR_SPEED * delta

    // Pulse tip glow
    const pulse = 0.6 + Math.sin(this.elapsed * 2.5) * 0.25
    for (let i = 0; i < this.tipMaterials.length; i++) {
      const mat = this.tipMaterials[i]!
      mat.emissiveIntensity = (this.landmarkGroups[i] === this.hoveredGroup ? 1.2 : pulse)
    }

    // Camera animation
    if (this.cameraAnim) {
      this.cameraAnim.elapsed += delta
      const t = Math.min(1, this.cameraAnim.elapsed / this.cameraAnim.duration)
      const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
      this.camera.position.lerpVectors(this.cameraAnim.fromPos, this.cameraAnim.toPos, eased)
      this.controls.target.lerpVectors(this.cameraAnim.fromTarget, this.cameraAnim.toTarget, eased)
      if (t >= 1) {
        const cb = this.cameraAnim.onComplete
        this.cameraAnim = null
        if (cb) cb()
      }
    }

    this.controls.update()
    this.renderer.render(this.scene, this.camera)
  }

  resize(w: number, h: number): void {
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
  }

  updateTheme(isDark: boolean): void {
    const palette: EarthPalette = isDark ? this.darkPalette : this.lightPalette
    const earthTex = this.earthTextures.get(isDark)!
    const cloudTex = this.cloudTextures.get(isDark)!

    this.earthMaterial.map = earthTex
    this.earthMaterial.emissiveMap = earthTex
    this.earthMaterial.emissiveIntensity = isDark ? 0.15 : 0.08
    this.earthMaterial.needsUpdate = true

    const cloudMat = this.cloudsMesh.material as THREE.MeshBasicMaterial
    cloudMat.map = cloudTex
    cloudMat.opacity = palette.cloudAlpha
    cloudMat.needsUpdate = true

    this.atmosphereMaterial.uniforms.uAtmosphereColor!.value = new THREE.Color(palette.atmosphere)
    this.starfieldMaterial.opacity = isDark ? 0.9 : 0.6
  }

  focusLandmark(landmark: Landmark): void {
    const index = LANDMARKS.findIndex((l) => l.id === landmark.id)
    if (index < 0) return
    const group = this.landmarkGroups[index]!

    this.frozen = true
    this.controls.autoRotate = false
    this.controls.minDistance = 1.2

    const targetWorldPos = new THREE.Vector3()
    group.getWorldPosition(targetWorldPos)

    const dir = targetWorldPos.clone().normalize()
    const toPos = dir.multiplyScalar(FOCUS_DISTANCE)

    this.cameraAnim = {
      fromPos: this.camera.position.clone(),
      toPos,
      fromTarget: this.controls.target.clone(),
      toTarget: targetWorldPos,
      elapsed: 0,
      duration: ANIM_DURATION,
    }
  }

  resetView(): void {
    this.cameraAnim = {
      fromPos: this.camera.position.clone(),
      toPos: new THREE.Vector3(0, 0.4, 3.2),
      fromTarget: this.controls.target.clone(),
      toTarget: new THREE.Vector3(0, 0, 0),
      elapsed: 0,
      duration: ANIM_DURATION,
      onComplete: () => {
        this.frozen = false
        this.controls.autoRotate = true
        this.controls.minDistance = 1.6
      },
    }
  }

  private updatePointer(e: PointerEvent): void {
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
  }

  private pickLandmark(): THREE.Group | null {
    this.camera.updateMatrixWorld(true)
    this.scene.updateMatrixWorld(true)
    this.raycaster.setFromCamera(this.pointer, this.camera)
    const earthHits = this.raycaster.intersectObject(this.earthMesh, false)
    const earthDist = earthHits.length > 0 ? earthHits[0]!.distance : Infinity
    const tipHits = this.raycaster.intersectObjects(this.landmarkTips, false)
    for (const hit of tipHits) {
      if (hit.distance < earthDist) {
        return hit.object.parent as THREE.Group
      }
    }
    return null
  }

  private onPointerMove = (e: PointerEvent): void => {
    if (this.cameraAnim) return
    this.updatePointer(e)
    const group = this.pickLandmark()

    if (group !== this.hoveredGroup) {
      if (this.hoveredGroup) {
        this.hoveredGroup.scale.setScalar(1)
      }
      this.hoveredGroup = group
      if (group) {
        group.scale.setScalar(1.6)
        this.renderer.domElement.style.cursor = 'pointer'
        this.onHoverLandmark?.(group.userData.landmark as Landmark, e.clientX, e.clientY)
      } else {
        this.renderer.domElement.style.cursor = 'default'
        this.onHoverLandmark?.(null, 0, 0)
      }
    } else if (group) {
      this.onHoverLandmark?.(group.userData.landmark as Landmark, e.clientX, e.clientY)
    }
  }

  private onPointerDown = (e: PointerEvent): void => {
    this.pointerDownPos = { x: e.clientX, y: e.clientY }
  }

  private onPointerUp = (e: PointerEvent): void => {
    if (!this.pointerDownPos) return
    const dx = e.clientX - this.pointerDownPos.x
    const dy = e.clientY - this.pointerDownPos.y
    this.pointerDownPos = null
    if (Math.sqrt(dx * dx + dy * dy) > 5) return
    if (this.cameraAnim) return

    this.updatePointer(e)
    let group = this.pickLandmark()
    if (!group && this.hoveredGroup) {
      group = this.hoveredGroup
    }
    if (group) {
      const lm = group.userData.landmark as Landmark
      this.focusLandmark(lm)
      this.onSelectLandmark?.(lm)
    }
  }

  dispose(): void {
    this.disposed = true
    cancelAnimationFrame(this.rafId)

    this.renderer.domElement.removeEventListener('pointermove', this.onPointerMove)
    this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown)
    this.renderer.domElement.removeEventListener('pointerup', this.onPointerUp)

    this.controls.dispose()

    for (const g of this.geometries) g.dispose()
    for (const m of this.materials) m.dispose()
    for (const t of this.textures) t.dispose()

    this.renderer.dispose()
    this.renderer.forceContextLoss()

    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement)
    }
  }
}
