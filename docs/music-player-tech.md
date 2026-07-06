# 音乐播放器 — 技术文档

> 路径：`src/stores/player.ts` + `src/components/Player{Bar,Full}.vue` + `src/data/`
> 定位：Lab-Studio 内嵌的本地音乐播放器，非独立音乐 App。支持歌词、频谱、EQ、氛围色。
> 数据规模：94 首 liked + 9 首洛克王国 BGM，按 id 去重后 108 首。

---

## 1. 总体架构

```
┌──────────────────────────────────────────────────┐
│                  LabShell.vue                     │
│  (全局挂载 <PlayerBar /> + <PlayerFull />)        │
├──────────────────────────────────────────────────┤
│  PlayerBar.vue           PlayerFull.vue           │
│  底部迷你播放栏          全屏播放器 (Teleport→body)│
│  z-index: 20             z-index: 200             │
├──────────────────────────────────────────────────┤
│              usePlayerStore (Pinia)               │
│  播放状态 / 播放列表 / EQ / 持久化 / 睡眠定时    │
├──────────────────────────────────────────────────┤
│  Audio 元素 (模块作用域单例) + Web Audio API Graph│
│  MediaElementSource → 5×BiquadFilter → Analyser   │
│  → destination                                    │
├──────────────────────────────────────────────────┤
│  data/                                            │
│  ├─ types.ts      Track / LyricLine 接口           │
│  ├─ tracks.ts     import.meta.glob 自动发现 songs/ │
│  ├─ roco-tracks.ts  自动发现 roco/                 │
│  ├─ songs/ (94 个 .ts)  每个导出 Omit<Track,'src'> │
│  └─ roco/ (9 个 .ts)                              │
└──────────────────────────────────────────────────┘
```

**三层分离**：数据（`data/`）→ 状态+音频引擎（`stores/player.ts`）→ UI（`components/`）。

**全局挂载策略**：`PlayerBar` 和 `PlayerFull` 在 `LabShell.vue` 根布局挂载，不是 `music-player/index.vue` 的子组件。这样切换路由时播放器状态不丢失，底部栏在所有页面可见。

---

## 2. 数据模型

### 2.1 核心类型 (`data/types.ts`)

```typescript
interface LyricLine {
  time: number   // 秒，浮点
  text: string
}

interface Track {
  id: string          // 网易云音乐 ID（如 "1361336636"）
  title: string
  artist: string
  album: string
  cover: string       // 远程封面 URL (p4.music.126.net)
  src: string         // 音频路径，由 tracks.ts 自动拼接 /audio/<slug>.mp3
  lyrics: LyricLine[]
}
```

### 2.2 自动发现机制 (`data/tracks.ts`)

```typescript
const modules = import.meta.glob<{ default: Omit<Track, 'src'> }>('./songs/*.ts', { eager: true })

export const tracks: Track[] = Object.entries(modules)
  .map(([p, m]) => ({ ...m.default, src: `/audio/${slugFromPath(p)}.mp3` }))
  .sort((a, b) => a.title.localeCompare(b, 'zh'))
```

- **添加歌曲**：在 `data/songs/` 下新建 `<slug>.ts`，导出 `Omit<Track, 'src'>` 对象，音频文件放 `public/audio/<slug>.mp3`。无需改注册表。
- **slug = 文件名**，驱动音频路径。
- `roco-tracks.ts` 同理，扫描 `data/roco/*.ts`。
- 两个集合按 `title.localeCompare('zh')` 排序。

### 2.3 集合与去重 (`stores/player.ts`)

```typescript
const allTracks: Track[] = [...tracks, ...rocoTracks].filter(
  (t, i, arr) => arr.findIndex((x) => x.id === t.id) === i,
)
// liked 与 roco 共享 4 个 id → 108 首

const COLLECTIONS = [
  { key: 'all',  label: '全部',     tracks: allTracks },
  { key: 'roco', label: '洛克王国', tracks: rocoTracks },
] as const
```

---

## 3. 音频引擎

### 3.1 Audio 元素（模块作用域单例）

```typescript
const audio = new Audio()
audio.preload = 'metadata'
```

**关键决策**：Audio 实例放在 `player.ts` 模块顶层，不在 Pinia store 内部。原因：
- 模块作用域在应用生命周期内只初始化一次，路由切换不会销毁。
- HMR 时模块重新执行会创建新实例，但开发环境可接受。
- 避免将非响应式对象塞进 Pinia 的 reactive proxy。

### 3.2 Web Audio Graph（懒创建）

```
MediaElementSource → BiquadFilter(60Hz) → BiquadFilter(230Hz)
  → BiquadFilter(910Hz) → BiquadFilter(3600Hz) → BiquadFilter(14000Hz)
  → AnalyserNode → AudioContext.destination
```

```typescript
function ensureAudioGraph() {
  if (audioCtx) return            // 只创建一次
  audioCtx = new (window.AudioContext || webkitAudioContext)()
  sourceNode = audioCtx.createMediaElementSource(audio)
  // 5 个 peaking 滤波器串联
  for (const freq of EQ_FREQS) {
    const f = audioCtx.createBiquadFilter()
    f.type = 'peaking'
    f.frequency.value = freq
    f.Q.value = 1
    filterNodes.push(f)
  }
  analyserNode = audioCtx.createAnalyser()
  analyserNode.fftSize = 128       // → 64 个频率 bin
  analyserNode.smoothingTimeConstant = 0.7
  // 串联：source → filters → analyser → destination
}
```

**懒创建时机**：首次调用 `play()` 时创建（用户手势触发），满足浏览器 Autoplay Policy。
**解锁**：`audioCtx.resume()` 在每次 `play()` 前调用，处理 iOS/Safari 的上下文锁定。

### 3.3 事件监听（模块作用域）

| 事件 | 处理 |
|---|---|
| `timeupdate` | `currentTime.value = audio.currentTime` |
| `loadedmetadata` | 读取 `duration` + 恢复上次播放位置（`pendingSeek`） |
| `durationchange` | 更新 `duration` |
| `ended` | 单曲循环 → 重播；否则 → `next()` |
| `play` / `pause` | 同步 `isPlaying` |
| `error` | `noAudio = true`（提示用户放入 mp3） |
| `waiting` | `isBuffering = true` |
| `playing` / `canplay` | `isBuffering = false` |

---

## 4. 状态管理 (Pinia Store)

### 4.1 响应式状态

| 状态 | 类型 | 说明 |
|---|---|---|
| `playlist` | `ref<Track[]>` | 当前播放列表（已过滤 disliked） |
| `currentIndex` | `ref<number>` | 当前曲目索引，-1 = 未选 |
| `isPlaying` | `ref<boolean>` | 播放中 |
| `isBuffering` | `ref<boolean>` | 缓冲中（显示条纹动画） |
| `currentTime` | `ref<number>` | 当前播放时间（秒） |
| `duration` | `ref<number>` | 总时长 |
| `playbackRate` | `ref<number>` | 倍速，默认 1 |
| `volume` | `ref<number>` | 0–1，默认 0.8 |
| `noAudio` | `ref<boolean>` | 音频文件缺失 |
| `playMode` | `ref<PlayMode>` | `'list' \| 'single' \| 'shuffle'` |
| `showFullPlayer` | `ref<boolean>` | 全屏播放器可见性 |
| `showPlaylist` | `ref<boolean>` | 播放列表面板可见性 |
| `eqGains` | `ref<number[]>` | 5 个频段增益（dB，-12~+12） |
| `eqEnabled` | `ref<boolean>` | EQ 开关 |
| `sleepTimer` | `ref<number \| null>` | 剩余秒数，null = 未启用 |
| `likedIds` | `ref<string[]>` | 已喜欢曲目 ID |
| `dislikedIds` | `ref<string[]>` | 已移除曲目 ID |
| `collectionKey` | `ref<'all' \| 'roco'>` | 当前集合 |
| `analyser` | `ref<AnalyserNode \| null>` | 暴露给 UI 的分析节点 |

### 4.2 计算属性

- `current` → `playlist[currentIndex] ?? null`
- `isLiked(id)` → `likedIds.includes(id)`

### 4.3 核心方法

```typescript
load(index)        // 设置 src、重置时间、标记 buffering
play()             // ensureAudioGraph → resume → audio.play()
pause() / toggle()
next() / prev()    // prev 特殊逻辑：>3s 时回到起点而非上一曲
seek(time) / setRate(rate) / setVolume(v)
playTrack(index)   // load + play
cyclePlayMode()    // list → single → shuffle → list
switchCollection(key)  // 切换集合并重新加载
toggleLike(id) / removeFromPlaylist(id)
startSleepTimer(minutes) / stopSleepTimer()
```

**`removeFromPlaylist` 逻辑**：
1. 从 `playlist` 移除
2. 加入 `dislikedIds`（持久化，下次加载自动过滤）
3. 若移除的是当前曲：加载同索引的下一首
4. 若移除的索引 < 当前索引：`currentIndex--` 保持指向不变

### 4.4 播放模式

```typescript
nextIndex(from) {
  if (shuffle) {
    let r = from
    while (r === from) r = Math.floor(Math.random() * len)  // 避免重复当前
    return r
  }
  return (from + 1) % len  // list 和 single 都用这个，single 在 ended 时单独处理
}
```

---

## 5. 持久化策略

### 5.1 四个 localStorage Key

| Key | 内容 | 时机 |
|---|---|---|
| `lab-player` | `{ volume, playMode, eqGains, eqEnabled }` | `watch` 深度监听，变化即写 |
| `lab-player-liked` | `string[]` 曲目 ID | `toggleLike` 时同步写 |
| `lab-player-disliked` | `string[]` 曲目 ID | `removeFromPlaylist` 时同步写 |
| `lab-player-progress` | `{ collectionKey, currentIndex, currentTime }` | **防抖 1500ms** |

### 5.2 进度恢复

```typescript
// 模块加载时
load(currentIndex.value)          // 加载但不播放（浏览器手势策略）
let pendingSeek = savedProgress?.currentTime ?? null
// loadedmetadata 事件中恢复 seek 位置
```

**不自动播放**：浏览器 Autoplay Policy 要求用户手势触发。页面刷新后只恢复到上次位置暂停。

---

## 6. UI 组件

### 6.1 入口卡片 (`apps/music-player/index.vue`)

- **空状态**：显示曲目数量 + "开始播放" 按钮 → `playTrack(0)` + `openFull()`
- **有曲目**：旋转封面 + 标题/艺人 + "打开全屏播放器" 按钮
- 封面播放时 8s 线性旋转

### 6.2 底部播放栏 (`components/PlayerBar.vue`)

`v-if="current"` 控制可见性。布局：`grid-template-columns: 1fr 2fr 1fr`

| 左 | 中 | 右 |
|---|---|---|
| 封面 + 标题 + 艺人 | 控制按钮 + 进度条 | 音量 + 队列 + 展开 |

**控制按钮**：播放模式 / 上一曲 / 播放暂停 / 下一曲 / 倍速下拉

**队列弹窗**：从底部栏上方弹出，`position: absolute; bottom: 100%`，活跃曲目自动 `scrollIntoView`

**进度条**：
- `<input type="range">` + CSS 变量 `--progress` 控制填充比例
- 悬停显示时间提示气泡
- 缓冲状态：45° 斜条纹动画

**音量**：hover 弹出竖向滑块（`transform: rotate(-90deg)`）

### 6.3 全屏播放器 (`components/PlayerFull.vue`)

`<Teleport to="body">` + `v-if="showFullPlayer && current"`，`z-index: 200`，`100dvh`。

#### 布局

```
┌──────────────────────────────────────┐
│  ?                          ✕        │  顶栏（快捷键帮助 / 关闭）
├──────────────────────────────────────┤
│                    │                 │
│   封面 + 频谱       │   歌词滚动区    │  主区域
│   曲目信息          │   (可点击跳转)  │  grid: 360px 1fr
│                    │                 │
├──────────────────────────────────────┤
│  进度条  ──────────────  时间        │
│  [模式][倍速][EQ][频谱][睡眠]        │  控制栏
│       [上一曲][播放][下一曲]         │
│  [喜欢][移除][音量][播放列表]        │
└──────────────────────────────────────┘
```

#### 封面/黑胶

- 260px 圆形，外层黑胶纹理（`repeating-radial-gradient` 模拟纹路）
- 内层 190px 封面图
- 中心 12px 唱片孔
- 播放时黑胶 8s 旋转
- 缓冲时封面呼吸脉冲
- 外发光 `box-shadow: 0 0 90px vibe-color 30%`

#### 频谱可视化（3 种模式）

**数据源**：`analyser.getByteFrequencyData()` → 64 bins → 降采样为 32 bars

**降采样**：
```typescript
const step = Math.floor(freqBuf.length / BARS)  // 64/32 = 2
for (let i = 0; i < BARS; i++) {
  let sum = 0
  for (let j = 0; j < step; j++) sum += freqBuf[i * step + j]
  target = sum / step / 255  // 归一化 0–1
}
```

**衰减平滑**：
```typescript
next[i] = target >= pv ? target : Math.max(target, pv * 0.82)
// 上升即时跟随，下降以 0.82 系数缓慢衰减
```

| 模式 | 渲染 | 说明 |
|---|---|---|
| `bars` | 32 个 `<span>` CSS `scaleY` | 经典竖条，渐变色 `vibe 30% → vibe` |
| `mirror` | 同上，但左右对称映射 | 低频在两侧，高频在中间 |
| `orbit` | Canvas 2D 420×420 | 128 条径向线条 + 填充环 + 底环，5 点平滑 |

**orbit 模式细节**：
- 32 bins → 128 bars（圆形镜像插值，低频在顶部相遇无断点）
- 每条线：`baseH(12) + sin 波形调制 + pow(v, 0.35) * modH(18)`
- 5 点移动平均平滑外轮廓
- 三层：底环（描边）+ 填充环体（径向渐变 0.1 alpha）+ 实色线条（0.5–1.0 alpha 按 v 变化）

#### 歌词系统

- **时间对齐**：`activeLyricIndex` — 找到最后一个 `line.time <= currentTime` 的行
- **自动滚动**：`scrollTo({ top, behavior: 'smooth' })`，居中活跃行
- **用户滚动覆盖**：`wheel`/`touchmove` 设 `userScrolled = true`，3 秒后恢复自动滚动
- **点击跳转**：点击任意歌词行 → `seek(line.time)`
- **视觉**：活跃行放大 1.03x + accent 色 + 加粗；上下 `mask-image` 渐隐

#### 播放列表面板（右侧抽屉）

- `position: absolute; right: 0; width: 380px`，`<transition name="slide">` 滑入
- 集合切换按钮（全部 / 洛克王国）
- 搜索框：标题 + 艺人 + 专辑模糊匹配
- 语言标签：全部 / 华语 / 欧美 / 日韩（Unicode 正则检测）
  ```typescript
  /[가-힣]/ → kr   /[ぁ-んァ-ヶー]/ → jp   /[一-鿿]/ → cn   else → en
  ```
- 活跃曲目 `scrollIntoView({ block: 'center' })`，280ms 延迟等待过渡
- 每项：序号 + 标题(含喜欢标记) + 艺人 + 移除按钮（hover 显示）

#### EQ 均衡器（模态弹窗）

- 5 频段：60Hz / 230Hz / 910Hz / 3600Hz / 14000Hz
- 滑块范围 -12 ~ +12 dB，步进 1
- 5 个预设：平直 / 人声 / 低音 / 高音 / 现场
- 启用/禁用开关（禁用时增益归零但保留值）

#### 睡眠定时器（模态弹窗）

- 选项：15 / 30 / 45 / 60 / 90 分钟
- `setInterval` 每秒倒数，到 0 自动 `pause()`
- 按钮显示剩余时间（如 "28m"）

#### 倍速菜单

- 6 档：0.5 / 0.75 / 1 / 1.25 / 1.5 / 2 x
- 弹出式菜单 + 全屏 backdrop

#### 键盘快捷键

| 键 | 功能 |
|---|---|
| `Space` | 播放/暂停 |
| `←` / `→` | 后退/前进 5 秒 |
| `↑` / `↓` | 音量 ±5% |
| `M` | 静音切换 |
| `N` / `P` | 下一曲/上一曲 |
| `?` (Shift+/) | 快捷键面板 |
| `Esc` | 逐级关闭：快捷键→EQ→睡眠→倍速→播放列表→全屏 |

输入框中（INPUT/TEXTAREA/SELECT/contentEditable）忽略快捷键。

#### 氛围色（Vibe Color）

```typescript
const vibePalette = ['#2dd4bf', '#f59e0b', '#ec4899', '#8b5cf6',
                     '#3b82f6', '#ef4444', '#10b981', '#f97316']
// hash track id → palette[index]
```

设为 CSS 变量 `--vibe`，驱动：
- 背景径向渐变（`::before` 伪元素，`color-mix` 24% 混合）
- 频谱条渐变色
- 黑胶外发光
- orbit 环形频谱颜色

---

## 7. 移动端适配

`@media (max-width: 720px)`：

**全屏播放器**：
- 布局从双栏 → 单列居中
- 封面 260→200px，歌词高度 320→180px
- 隐藏：倍速、EQ、移除、音量
- 播放列表：88% 宽度，隐藏语言标签，移除按钮常驻

**底部栏**：
- 隐藏进度条、倍速、音量
- 只保留：封面+标题 / 控制 / 队列+展开

**安全区域**：`env(safe-area-inset-*)` 处理刘海/底部。

---

## 8. 设计令牌

播放器使用全局 CSS 变量（非硬编码颜色），主题切换自动响应：

| 令牌 | 用途 |
|---|---|
| `--color-bg` | 背景 |
| `--color-surface` / `--color-surface-2` | 卡片/按钮背景 |
| `--color-text` / `--color-text-muted` | 主/次文字 |
| `--color-accent` / `--color-accent-soft` | 强调色及柔和版 |
| `--color-border` | 边框 |
| `--space-1` ~ `--space-8` | 间距阶梯 |
| `--radius-sm` / `--radius-md` / `--radius-lg` / `--radius-full` | 圆角 |
| `--font-mono` / `--font-sans` | 等宽/无衬线字体 |

---

## 9. 关键技术决策

| 决策 | 原因 |
|---|---|
| Audio 实例在模块作用域，不在 store 内 | 路由切换不销毁；避免 reactive 代理非响应式对象 |
| Web Audio Graph 懒创建 | 浏览器 Autoplay Policy 要求用户手势创建 AudioContext |
| `import.meta.glob` 自动发现歌曲 | 新增歌曲只需放文件，不改注册表 |
| 进度持久化防抖 1500ms | 避免频繁写 localStorage 影响性能 |
| 不自动播放，只恢复位置 | Autoplay Policy；用户手势触发 `play()` |
| `filterDisliked` 而非删除数据 | disliked 持久化，切换集合时自动过滤 |
| 频谱 32 bars 而非 64 | 视觉密度适中，`fftSize=128` 的 64 个 bin 降采样后足够 |
| orbit Canvas 而非 WebGL | 2D Canvas 够用，避免引入额外 3D 库 |
| vibe color 用 id hash 而非封面取色 | 避免 CORS 限制（封面来自远程域名），稳定可复现 |
| `Teleport to="body"` 全屏播放器 | 脱离布局流，`z-index: 200` 覆盖一切 |
| `prefers-reduced-motion` 全面降级 | 黑胶旋转、缓冲条纹、歌词平滑滚动均禁用 |

---

## 10. 已知限制与潜在需求方向

| 限制 | 说明 |
|---|---|
| 无在线搜索/流媒体 | 纯本地播放器，歌曲数据来自 `data/` 静态文件 |
| 封面依赖远程 CDN | `p4.music.126.net` 不可用时封面缺失，无降级图 |
| 歌词为静态嵌入 | 无 LRC 文件解析、无在线歌词获取 |
| EQ 仅 5 频段 | 无法自定义频段数量/频率 |
| 无播放历史 | 只有 liked/disliked，无"最近播放"列表 |
| 无跨设备同步 | 纯 localStorage，无云同步 |
| 频谱无录音/输出 | Analyser 仅用于可视化，无音频录制 |
| 无歌词翻译/罗马音 | 只有原文歌词 |
| 播放列表无拖拽排序 | 只能按默认排序、搜索过滤、移除 |
| 无音量归一化 | 不同曲目音量差异靠手动调节 |
| 无 gapless 播放 | 曲目间有短暂静默切换 |
| 睡眠定时器固定选项 | 无法自定义分钟数 |
