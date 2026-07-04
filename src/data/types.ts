export interface LyricLine {
  time: number
  text: string
}

export interface Track {
  id: string
  title: string
  artist: string
  album: string
  cover: string
  src: string
  lyrics: LyricLine[]
}
