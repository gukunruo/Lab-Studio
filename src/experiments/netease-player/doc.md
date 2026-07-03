# 云音乐播放器

仿网易云音乐的轻量播放器实验。目标是验证「原生 `<audio>` 是否够用」——结论是够。

## 能力

- 播放 / 暂停 / 上一曲 / 下一曲
- 拖拽进度条（带填充色）
- 倍速（0.5x – 2x）
- 音量控制 + 静音
- 播放列表（可折叠，点击切换曲目）
- 黑胶旋转动画
- 歌词随进度滚动，点击歌词可跳转

## 技术选型

原生 `<audio>` API（`play` / `pause` / `currentTime` / `duration` / `playbackRate` / `timeupdate`）即可覆盖以上全部能力，因此**未引入** Howler 等音频库。状态逻辑封装在 `useAudioPlayer` 组合式函数里，UI 与状态解耦。

> 何时需要库：若后续加入音频可视化（频谱）、均衡器、或流式播放，再引入 Howler / Web Audio API 即可。

## Mock 数据

- 音频：SoundHelix 免费示例 MP3
- 封面：picsum.photos 占位图
- 歌词：为演示编造的逐行时间戳

国内访问 SoundHelix 较慢时，把 MP3 放进 `public/` 并替换 `mock.ts` 里的 `src` 即可。
