# 云音乐播放器

仿网易云音乐的播放器实验。歌单来自账号「我喜欢的音乐」，音频、封面、歌词均为真实数据。

## 能力

- 播放 / 暂停 / 上一曲 / 下一曲
- 拖拽进度条（带填充色）
- 倍速（0.5x – 2x）
- 音量控制 + 静音
- 播放列表（可折叠，点击切换曲目，带角标计数）
- 黑胶唱片旋转动画（专辑封面 + 偏移黑胶）
- 歌词随进度滚动，点击歌词可跳转

## 数据

元数据、专辑封面、逐行 LRC 歌词、音频文件均通过网易云 API 拉取（使用账号自身的 `MUSIC_U` cookie，VIP 账号）：

- 调 `/api/v6/playlist/detail` 取「我喜欢的音乐」歌单曲目
- 调 `/api/song/enhance/player/url` 取每首 320kbps 音频直链并下载
- 调 `/api/song/detail`、`/api/song/lyric` 补全封面与同步歌词

音频文件已下载到 `public/audio/<songId>.mp3`，播放器开箱即用，无需再手动放置文件。歌词会自动与音频同步。

## 技术选型

原生 `<audio>` API（`play` / `pause` / `currentTime` / `duration` / `playbackRate` / `timeupdate`）覆盖全部能力，**未引入** Howler 等音频库。状态逻辑封装在 `useAudioPlayer` 组合式函数里，UI 与状态解耦。

> 何时需要库：若后续加入音频可视化（频谱）、均衡器、或流式播放，再引入 Howler / Web Audio API 即可。
