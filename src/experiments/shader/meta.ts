import type { ExperimentMetaInput } from '@/experiments/_registry'

const meta: ExperimentMetaInput = {
  title: { zh: '流体着色器', en: 'Fluid Shader' },
  description: {
    zh: 'WebGL 片段着色器,fbm 噪声 + 余弦调色板,鼠标驱动流场。',
    en: 'WebGL fragment shader. fbm noise + cosine palette, mouse-driven flow field.',
  },
  tags: ['webgl', 'shader'],
  date: '2026-07-05',
}

export default meta
