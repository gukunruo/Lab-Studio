import type { ExperimentMetaInput } from '@/experiments/_registry'

const meta: ExperimentMetaInput = {
  title: { zh: '音乐宇宙', en: 'Music Universe' },
  description: {
    zh: 'D3 力导向布局,按 artist 聚合 liked + 洛克王国曲库,圆大小=歌曲数。',
    en: 'D3 force layout clustering liked + Roco tracks by artist. Bubble size = track count.',
  },
  tags: ['d3', 'visualization'],
  date: '2026-07-05',
}

export default meta
