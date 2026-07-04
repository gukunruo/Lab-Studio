import type { Track } from './types'

// Auto-discover every 洛克王国 track under ./roco/. Add a track by dropping
// a new <slug>.ts file there. Slug (filename) drives /audio/<slug>.mp3.
const modules = import.meta.glob<{ default: Omit<Track, 'src'> }>('./roco/*.ts', {
  eager: true,
})

function slugFromPath(p: string): string {
  return p.split('/').at(-1)!.replace(/\.ts$/, '')
}

export const rocoTracks: Track[] = Object.entries(modules)
  .map(([p, m]) => ({ ...m.default, src: `/audio/${slugFromPath(p)}.mp3` }))
  .sort((a, b) => a.title.localeCompare(b.title, 'zh'))
