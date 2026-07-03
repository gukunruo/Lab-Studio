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

// Mock playlist. Audio uses SoundHelix royalty-free sample tracks (free for testing).
// If these are slow in your region, drop MP3s into /public and swap the `src` URLs here.
// Lyrics are fabricated for the demo (not real song lyrics).
export const tracks: Track[] = [
  {
    id: 'night-radio',
    title: '深夜电台',
    artist: '夜行者',
    album: '凌晨三点',
    cover: 'https://picsum.photos/seed/night-radio/400/400',
    src: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    lyrics: [
      { time: 0, text: '深夜电台 - 夜行者' },
      { time: 8, text: '城市的灯一盏一盏熄灭' },
      { time: 16, text: '收音机里还在播放旧歌' },
      { time: 24, text: '我把车停在跨海桥上' },
      { time: 32, text: '看海面闪着最后的光' },
      { time: 48, text: '风从车窗缝里钻进来' },
      { time: 56, text: '带走了一整天的疲惫' },
      { time: 72, text: '没有人在凌晨问你去哪' },
      { time: 88, text: '只有这台老旧的电台' },
      { time: 104, text: '还在陪你数星星' },
      { time: 120, text: '深夜电台 不眠的人' },
      { time: 136, text: '深夜电台 还在等你' },
      { time: 152, text: '直到天亮 说声晚安' },
    ],
  },
  {
    id: 'aurora-prelude',
    title: '晨光序曲',
    artist: 'Aurora Project',
    album: '日出',
    cover: 'https://picsum.photos/seed/aurora-prelude/400/400',
    src: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
    lyrics: [
      { time: 0, text: '晨光序曲 - Aurora Project' },
      { time: 10, text: '天光从云缝里漏下来' },
      { time: 20, text: '落在你熟睡的睫毛上' },
      { time: 35, text: '咖啡的香气穿过走廊' },
      { time: 50, text: '叫醒了一整座城市' },
      { time: 65, text: '我们慢慢推开窗' },
      { time: 80, text: '让风吹散昨夜的梦' },
      { time: 95, text: '新的一天 像一张白纸' },
      { time: 110, text: '等你写下第一行' },
      { time: 125, text: '晨光序曲 轻轻响起' },
      { time: 140, text: '愿你今天 不慌不忙' },
    ],
  },
  {
    id: 'city-drift',
    title: '城市漂流',
    artist: 'Street Echo',
    album: '通勤',
    cover: 'https://picsum.photos/seed/city-drift/400/400',
    src: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3',
    lyrics: [
      { time: 0, text: '城市漂流 - Street Echo' },
      { time: 12, text: '地铁里挤满了沉默的人' },
      { time: 24, text: '每个人都低头看屏幕' },
      { time: 36, text: '玻璃窗上映着疲惫的脸' },
      { time: 48, text: '谁也不知道谁的故事' },
      { time: 66, text: '我们在这座城市漂流' },
      { time: 78, text: '像没有地址的信件' },
      { time: 96, text: '偶尔在某个路口停下' },
      { time: 108, text: '又被人群推着向前' },
      { time: 126, text: '城市漂流 没有终点' },
      { time: 144, text: '但总有一盏灯 为你亮着' },
    ],
  },
]
