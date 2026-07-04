import type { Track } from './types'

export type { Track, LyricLine } from './types'

// Auto-discover every song file under ./songs/. Add a track by dropping a
// new <slug>.ts file there — no registry edit needed. The slug (filename)
// drives the audio path: /public/audio/<slug>.mp3.
const modules = import.meta.glob<{ default: Omit<Track, 'src'> }>('./songs/*.ts', {
  eager: true,
})

function slugFromPath(p: string): string {
  return p.split('/').at(-1)!.replace(/\.ts$/, '')
}

export const tracks: Track[] = Object.entries(modules)
  .map(([p, m]) => ({ ...m.default, src: `/audio/${slugFromPath(p)}.mp3` }))
  .sort((a, b) => a.title.localeCompare(b.title, 'zh'))
