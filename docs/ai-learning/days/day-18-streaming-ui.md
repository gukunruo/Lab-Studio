# Day 18 · AI + 前端：流式 UI

> Phase 3 · 产品与工程 · ~60 min  
> 标签：`frontend` `sse` `streaming` `vue` `abort`  
> 前置：Day 08（SSE 解析）、Day 17（错误与中断）  
> 定位：把 Day 08 的 SSE（Server-Sent Events，服务器推送事件）接到 Vue 3 前端，做产品级流式对话手感。这是你相对纯后端的优势区。

## 今日目标

画出流式 UX 状态机、用 `fetch` + `ReadableStream` + `AbortController` 跑通最小可中止流式 Chat、知道假打字机的坑与 Markdown 流式渲染闪烁的对策。

## 为什么重要

同样后端，前端处理流式的方式决定产品是否"像现代 AI 产品"。Day 08 在 Python 解析 SSE，今天在前端把它变成用户看得见的打字效果——首字延迟、可中止、断流保留。Lab-Studio 的 `AiTutor.vue` 已是这套，今天从零理解它为什么这么写。

## 核心概念

### 1. 关键 UX 状态机

```
idle → submitting → streaming → done
                      ↘ error
                      ↘ aborted
```

每个状态都要有 UI：`submitting` 显示"思考中"骨架、`streaming` 显示打字 + Stop 按钮、`error` 可重试、`aborted` 保留已收内容。

### 2. fetch + ReadableStream 实现要点

```vue
<!-- scripts/StreamChat.vue -->
<script setup lang="ts">
import { ref, shallowRef } from 'vue'

const input = ref('')
const messages = ref<{ role: 'user' | 'assistant'; content: string }[]>([])
const streaming = ref(false)
const ctrl = shallowRef<AbortController | null>(null)

async function send() {
  const q = input.value.trim()
  if (!q || streaming.value) return
  input.value = ''
  messages.value.push({ role: 'user', content: q })
  const assistant = { role: 'assistant' as const, content: '' }
  messages.value.push(assistant)
  streaming.value = true
  ctrl.value = new AbortController()

  try {
    const res = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: messages.value.slice(0, -1), system: '你是简洁助教' }),
      signal: ctrl.value.signal,
    })
    if (!res.ok || !res.body) throw new Error(String(res.status))
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })  // stream:true 处理 UTF-8 跨块
      let sep: number
      while ((sep = buffer.indexOf('\n\n')) >= 0) {
        const block = buffer.slice(0, sep)
        buffer = buffer.slice(sep + 2)
        for (const line of block.split('\n')) {
          if (!line.startsWith('data:')) continue
          const data = line.slice(5).trim()
          if (data === '[DONE]') continue
          try {
            const evt = JSON.parse(data)
            const delta = evt?.delta?.text
            if (delta) assistant.content += delta  // 累积
          } catch { /* 跨块断行，等下一帧 */ }
        }
      }
    }
  } catch (e) {
    if ((e as Error).name !== 'AbortError') assistant.content += `\n[错误] ${(e as Error).message}`
  } finally {
    streaming.value = false
    ctrl.value = null
  }
}

function stop() { ctrl.value?.abort() }
</script>

<template>
  <input v-model="input" @keydown.enter="send" :disabled="streaming" />
  <button @click="streaming ? stop() : send()">{{ streaming ? '停止' : '发送' }}</button>
  <div v-for="(m, i) in messages" :key="i">{{ m.content }}</div>
</template>
```

**要点**：

- `AbortController` 绑定 Stop——用户能立即中断
- `decoder.decode(value, { stream: true })` 处理 UTF-8 跨块（中文一个字可能被拆成两个 chunk）
- delta 累积到 assistant 消息，**别每 token 创建新对象**（性能）
- `[DONE]` 跳过（外层 while 结束自然收尾）

### 3. 不要假打字机

真流式：随包到达追加。假打字机：整段到了再 `setInterval` 蹦字——**延迟更差（等整段）且难中止**。后端给流式就用真流式，别前端再装。

### 4. Markdown 流式渲染闪烁

流式渲染 Markdown 时，未闭合的代码围栏 ```` ``` ```` 会让渲染器反复重排闪烁。对策：

- 用能容忍不完整输入的渲染器（`marked` 多数能扛）
- 或流式阶段纯文本、结束后再 Markdown 渲染
- 代码块识别到围栏开始就锁定该块，边收边渲

### 5. 滚动：别强制吸底

用户上翻阅读时不要强制拉回底部——打断阅读。Day 的做法：检测"是否在底部 40px 内"（`userScrolled`），只有用户没上翻才 `scrollToBottom`。Lab-Studio 的 `AiTutor.vue` 正是这个模式。

### 6. Vue 性能小贴士

- 大消息列表别每 token 做沉重计算（语法高亮等放 done 后）
- `shallowRef` 放需要但不必深度响应的大对象
- 流式写 Pinia 时防组件卸载后仍写（`onUnmounted` 清理）
- 长会话后期才上虚拟列表，先保证正确

### 7. 失败模式

| 症状 | 多半是 |
|---|---|
| 中文乱码 | 没 `stream: true`，UTF-8 被截断 |
| 中止不掉 | 没传 signal 或没清理 reader |
| 卡顿 | 每 token 全量重渲/重算高亮 |
| 闪烁 | Markdown 对不完整输入重排 |
| 用户上翻被拉回 | 强制吸底，没判断 userScrolled |

## 动手练习（30–40 min）

1. **最小 Chat**：在 Lab-Studio 或临时沙盒做最小 Chat——输入框 + 消息列表 + Stop。无 Key 用 `setInterval` 模拟 delta 也能练状态机。
2. **状态机补齐**：加 `error`（网络失败）与 `aborted`（用户中止）的文案，验证中止后已收内容保留。
3. **首包骨架**：记录首包前等待如何展示（骨架/"思考中"spinner）。

## 自检清单

- [ ] 能画出前端流式状态机
- [ ] 实现或模拟过可中止流式（AbortController）
- [ ] 知道 `stream: true` 处理 UTF-8 跨块
- [ ] 知道假打字机的问题
- [ ] 实现了"用户上翻不强制吸底"

## 明日预告

Day 19 · Chat 产品交互模式 —— Chat 不只是气泡：引用、追问、工具状态、空态、克制。

## 续学提示词

```text
按 docs/ai-learning/00-profile.md 教我 Day 18。
文件：docs/ai-learning/days/day-18-streaming-ui.md
我用 Vue 3，请审我的 StreamChat.vue 是否处理了中止后保留内容。
不要提前讲 Day 19。
```
