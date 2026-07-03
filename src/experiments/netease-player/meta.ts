import type { ExperimentMetaInput } from '@/experiments/_registry'

const meta: ExperimentMetaInput = {
  title: { zh: '云音乐播放器', en: 'Cloud Music Player' },
  description: {
    zh: '仿网易云音乐的播放器:黑胶旋转、歌词滚动、进度拖拽、倍速、播放列表。原生 audio 实现。',
    en: 'NetEase-style player: spinning vinyl, synced lyrics, draggable progress, playback rate, playlist. Native audio.',
  },
  tags: ['audio', 'ui-clone', 'vue3'],
  date: '2026-07-04',
}

export default meta
