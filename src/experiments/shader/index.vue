<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

const canvasEl = ref<HTMLCanvasElement | null>(null)
let gl: WebGLRenderingContext | null = null
let program: WebGLProgram | null = null
let raf = 0
let startTime = 0
const mouse = { x: 0.5, y: 0.5 }

const VERT = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`

const FRAG = `
precision highp float;
uniform vec2 u_res;
uniform float u_time;
uniform vec2 u_mouse;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p *= 2.0;
    a *= 0.5;
  }
  return v;
}
vec3 palette(float t) {
  return 0.5 + 0.5 * cos(6.28318 * (vec3(1.0) * t + vec3(0.20, 0.55, 0.65)));
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res.xy;
  vec2 p = (uv - 0.5) * 2.4;
  p.x *= u_res.x / u_res.y;
  vec2 m = (u_mouse - 0.5) * 1.5;
  float t = u_time * 0.12;
  float n = fbm(p * 1.4 + vec2(t, t * 0.6) + m);
  float n2 = fbm(p * 2.8 - vec2(t * 0.7, t * 0.3) - m * 0.5);
  vec3 col = palette(n * 0.7 + n2 * 0.3 + t * 0.4);
  col *= 0.82 + 0.18 * n2;
  col += (1.0 - smoothstep(0.0, 0.6, length(uv - u_mouse))) * 0.06;
  gl_FragColor = vec4(col, 1.0);
}
`

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const s = gl.createShader(type)
  if (!s) return null
  gl.shaderSource(s, src)
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.error('shader compile error:', gl.getShaderInfoLog(s))
    gl.deleteShader(s)
    return null
  }
  return s
}

function onResize() {
  const c = canvasEl.value
  if (!c || !gl) return
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const w = Math.max(1, Math.floor(c.clientWidth * dpr))
  const h = Math.max(1, Math.floor(c.clientHeight * dpr))
  if (c.width !== w || c.height !== h) {
    c.width = w
    c.height = h
    gl.viewport(0, 0, w, h)
  }
}

function frame() {
  if (!gl || !program) return
  const uRes = gl.getUniformLocation(program, 'u_res')
  const uTime = gl.getUniformLocation(program, 'u_time')
  const uMouse = gl.getUniformLocation(program, 'u_mouse')
  gl.uniform2f(uRes, gl.canvas.width, gl.canvas.height)
  gl.uniform1f(uTime, (performance.now() - startTime) / 1000)
  gl.uniform2f(uMouse, mouse.x, 1 - mouse.y)
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  raf = requestAnimationFrame(frame)
}

function onMouse(e: MouseEvent) {
  const c = canvasEl.value
  if (!c) return
  const rect = c.getBoundingClientRect()
  mouse.x = (e.clientX - rect.left) / rect.width
  mouse.y = (e.clientY - rect.top) / rect.height
}

onMounted(() => {
  const c = canvasEl.value
  if (!c) return
  gl = (c.getContext('webgl', { preserveDrawingBuffer: true, antialias: false }) ||
    c.getContext('experimental-webgl', { preserveDrawingBuffer: true, antialias: false })) as WebGLRenderingContext | null
  if (!gl) return
  const vs = compile(gl, gl.VERTEX_SHADER, VERT)
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG)
  if (!vs || !fs) return
  program = gl.createProgram()
  if (!program) return
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('program link error:', gl.getProgramInfoLog(program))
    return
  }
  gl.useProgram(program)
  const buf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
  const loc = gl.getAttribLocation(program, 'a_pos')
  gl.enableVertexAttribArray(loc)
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
  onResize()
  window.addEventListener('resize', onResize)
  c.addEventListener('mousemove', onMouse)
  startTime = performance.now()
  raf = requestAnimationFrame(frame)
})

onUnmounted(() => {
  cancelAnimationFrame(raf)
  window.removeEventListener('resize', onResize)
  if (canvasEl.value) canvasEl.value.removeEventListener('mousemove', onMouse)
  if (gl && program) gl.deleteProgram(program)
})
</script>

<template>
  <div class="shader">
    <div class="shader__stage">
      <canvas ref="canvasEl" class="shader__canvas"></canvas>
    </div>
    <p class="shader__hint">移动鼠标改变流场 · fbm 噪声 + 余弦调色板</p>
  </div>
</template>

<style scoped lang="scss">
.shader__stage {
  width: 100%;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  overflow: hidden;
  background: #000;
}

.shader__canvas {
  width: 100%;
  height: 520px;
  display: block;
}

.shader__hint {
  margin-top: var(--space-3);
  font-size: 0.82rem;
  color: var(--color-text-muted);
  font-family: var(--font-mono);
}
</style>
