<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { loadSource } from '@/learn/cc-lab'

const props = defineProps<{ labId: string }>()

const source = ref<string | null>(null)
const filename = computed(() => `${props.labId}.py`)

watch(
  () => props.labId,
  async (labId) => {
    source.value = null
    if (!labId) return
    source.value = await loadSource(labId)
  },
  { immediate: true },
)

interface Token {
  text: string
  cls: string
}

const KEYWORDS = new Set([
  'def', 'class', 'import', 'from', 'return', 'if', 'elif', 'else',
  'while', 'for', 'in', 'not', 'and', 'or', 'is', 'None', 'True',
  'False', 'try', 'except', 'raise', 'with', 'as', 'yield', 'break',
  'continue', 'pass', 'global', 'lambda', 'async', 'await', 'self',
])

const TOKEN_RE =
  /(\b(?:def|class|import|from|return|if|elif|else|while|for|in|not|and|or|is|None|True|False|try|except|raise|with|as|yield|break|continue|pass|global|lambda|async|await|self)\b|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|f"(?:[^"\\]|\\.)*"|f'(?:[^'\\]|\\.)*'|#.*$|\b\d+(?:\.\d+)?\b)/

function isQuoted(part: string): boolean {
  return (
    (part.startsWith('"') && part.endsWith('"')) ||
    (part.startsWith("'") && part.endsWith("'")) ||
    (part.startsWith('f"') && part.endsWith('"')) ||
    (part.startsWith("f'") && part.endsWith("'"))
  )
}

function tokenize(line: string): Token[] {
  const trimmed = line.trimStart()
  if (trimmed.startsWith('#')) return [{ text: line, cls: 'cmt' }]
  if (trimmed.startsWith('@')) return [{ text: line, cls: 'deco' }]
  if (trimmed.startsWith('"""') || trimmed.startsWith("'''")) return [{ text: line, cls: 'str' }]

  return line
    .split(TOKEN_RE)
    .filter(Boolean)
    .map((part): Token => {
      if (KEYWORDS.has(part)) return { text: part, cls: 'kw' }
      if (part === 'self') return { text: part, cls: 'self' }
      if (part.startsWith('#')) return { text: part, cls: 'cmt' }
      if (isQuoted(part)) return { text: part, cls: 'str' }
      if (/^\d+(?:\.\d+)?$/.test(part)) return { text: part, cls: 'num' }
      return { text: part, cls: '' }
    })
}

const lines = computed(() =>
  (source.value?.split('\n') ?? []).map((l, i) => ({ n: i + 1, toks: tokenize(l) })),
)
</script>

<template>
  <section class="cc-src">
    <template v-if="!source">
      <div class="cc-src__na">该章节暂无源码。</div>
    </template>
    <template v-else>
      <div class="cc-src__win">
        <div class="cc-src__bar">
          <span class="cc-src__dot cc-src__dot--r" />
          <span class="cc-src__dot cc-src__dot--y" />
          <span class="cc-src__dot cc-src__dot--g" />
          <span class="cc-src__name">{{ filename }}</span>
        </div>
        <div class="cc-src__body">
          <pre class="cc-src__pre"><code>
            <div v-for="line in lines" :key="line.n" class="cc-src__line">
              <span class="cc-src__ln">{{ line.n }}</span>
              <span class="cc-src__txt"><span
                v-for="(tok, ti) in line.toks"
                :key="ti"
                :class="tok.cls ? `cc-tok--${tok.cls}` : ''"
              >{{ tok.text }}</span></span>
            </div>
          </code></pre>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped lang="scss">
.cc-src__na {
  padding: 24px;
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-md);
  font-size: 14px;
  color: var(--color-text-muted);
}

.cc-src__win {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.cc-src__bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 9px 12px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface-2);
}

.cc-src__dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
}

.cc-src__dot--r { background: #ef4444; }
.cc-src__dot--y { background: #f59e0b; }
.cc-src__dot--g { background: #10b981; }

.cc-src__name {
  margin-left: 6px;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--color-text-muted);
}

.cc-src__body {
  overflow-x: auto;
  background: #0f172a;
}

.cc-src__pre {
  margin: 0;
  padding: 12px 0;
  font-family: var(--font-mono);
  font-size: 12.5px;
  line-height: 1.6;
  color: #e2e8f0;
}

.cc-src__line {
  display: flex;
  padding: 0 16px;
}

.cc-src__ln {
  flex-shrink: 0;
  width: 36px;
  margin-right: 16px;
  text-align: right;
  color: #475569;
  user-select: none;
}

.cc-src__txt {
  white-space: pre;
}

.cc-tok--kw { color: #60a5fa; font-weight: 500; }
.cc-tok--self { color: #c084fc; }
.cc-tok--cmt { color: #94a3b8; font-style: italic; }
.cc-tok--str { color: #34d399; }
.cc-tok--num { color: #fb923c; }
.cc-tok--deco { color: #fbbf24; }
</style>
