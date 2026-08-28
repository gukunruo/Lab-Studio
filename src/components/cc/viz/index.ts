import type { Component } from 'vue'
import { defineAsyncComponent } from 'vue'

// 键为原站课程 id（见 cc-lab.ts 的 labIdForChapter 映射）；内容与工厂懒加载进各自 chunk。
export const CHAPTER_VIZ: Record<string, Component> = {
  s01: defineAsyncComponent(() => import('./AgentLoopViz.vue')),
  s02: defineAsyncComponent(() => import('./ToolDispatchViz.vue')),
  s03: defineAsyncComponent(() => import('./PermissionViz.vue')),
  s04: defineAsyncComponent(() => import('./HooksViz.vue')),
  s05: defineAsyncComponent(() => import('./TodoWriteViz.vue')),
  s06: defineAsyncComponent(() => import('./SubagentViz.vue')),
  s07: defineAsyncComponent(() => import('./SkillLoadingViz.vue')),
  s08: defineAsyncComponent(() => import('./ContextCompactViz.vue')),
  s09: defineAsyncComponent(() => import('./MemoryViz.vue')),
  s10: defineAsyncComponent(() => import('./TaskSystemViz.vue')),
  s11: defineAsyncComponent(() => import('./BackgroundTasksViz.vue')),
  s12: defineAsyncComponent(() => import('./CronSchedulerViz.vue')),
  s13: defineAsyncComponent(() => import('./TeamRuntimeViz.vue')),
  s14: defineAsyncComponent(() => import('./McpToolsViz.vue')),
  s15: defineAsyncComponent(() => import('./IntegratedHarnessViz.vue')),
}
