import type { Component } from 'vue'
import { defineAsyncComponent } from 'vue'

// 键为原站课程 id（见 cc-lab.ts 的 labIdForChapter 映射）；内容与工厂懒加载进各自 chunk。
export const CHAPTER_VIZ: Record<string, Component> = {
  s01: defineAsyncComponent(() => import('./AgentLoopViz.vue')),
}
