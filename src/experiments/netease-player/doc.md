# 云音乐播放器

仿网易云音乐的播放器实验。周杰伦 8 首歌单作为 mock 数据。

## 能力

- 播放 / 暂停 / 上一曲 / 下一曲
- 拖拽进度条（带填充色）
- 倍速（0.5x – 2x）
- 音量控制 + 静音
- 播放列表（可折叠，点击切换曲目，带角标计数）
- 黑胶唱片旋转动画（专辑封面 + 偏移黑胶）
- 歌词随进度滚动，点击歌词可跳转

## 数据

元数据、专辑封面、逐行 LRC 歌词均来自网易云音乐公开 API（`music.163.com`），是真实数据：

- 晴天 / 珊瑚海 / 退后 / 枫 / 七里香 / 稻香 / 青花瓷 / 一路向北

**音频**：这些曲目在网易云为 VIP，公开直链（`outer/url`）会返回 404。要启用播放，请把本地 MP3 放到 `public/jay-chou/` 目录，文件名对应 `mock.ts` 里的 `slug`：

```
public/jay-chou/qing-tian.mp3
public/jay-chou/shan-hu-hai.mp3
public/jay-chou/tui-hou.mp3
public/jay-chou/feng.mp3
public/jay-chou/qi-li-xiang.mp3
public/jay-chou/dao-xiang.mp3
public/jay-chou/qing-hua-ci.mp3
public/jay-chou/yi-lu-xiang-bei.mp3
```

放入文件后播放器即可完整工作；歌词会自动与音频同步。

## 技术选型

原生 `<audio>` API（`play` / `pause` / `currentTime` / `duration` / `playbackRate` / `timeupdate`）覆盖全部能力，**未引入** Howler 等音频库。状态逻辑封装在 `useAudioPlayer` 组合式函数里，UI 与状态解耦。

> 何时需要库：若后续加入音频可视化（频谱）、均衡器、或流式播放，再引入 Howler / Web Audio API 即可。
