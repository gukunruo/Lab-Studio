import type { ExperimentMetaInput } from '@/experiments/_registry'

const meta: ExperimentMetaInput = {
  title: { zh: '你好，Lab', en: 'Hello, Lab' },
  description: {
    zh: '起始实验，验证自动发现、路由与实验外壳。',
    en: 'Starter experiment. Validates auto-discovery, routing, and the experiment frame.',
  },
  tags: ['meta', 'starter'],
  date: '2026-07-04',
}

export default meta
