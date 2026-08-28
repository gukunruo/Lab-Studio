<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { loadVersions, type LabVersions } from '@/learn/cc-lab'

const props = defineProps<{ labId: string }>()

const versions = ref<LabVersions | null>(null)

watch(
  () => props.labId,
  async () => {
    versions.value = await loadVersions()
  },
  { immediate: true },
)

const CLASS_DESCRIPTIONS: Record<string, string> = {
  TodoManager: 'Visible task planning with constraints',
  SkillLoader: 'Dynamic knowledge injection from SKILL.md files',
  ContextManager: 'Three-layer context compression pipeline',
  Task: 'File-based persistent task with dependencies',
  TaskManager: 'File-based persistent task CRUD with dependencies',
  BackgroundTask: 'Single background execution unit',
  BackgroundManager: 'Non-blocking thread execution + notification queue',
  TeammateManager: 'Multi-agent team lifecycle and coordination',
  Teammate: 'Individual agent identity and state tracking',
  SharedBoard: 'Cross-agent shared state coordination',
  CronJob: 'Durable recurring job definition',
  ProtocolState: 'Pending team protocol requests and response matching',
  MCPClient: 'External tool discovery and invocation client',
  RecoveryState: 'Retry, fallback, and continuation state',
}

function layerColors(layer: string): { border: string; bg: string } {
  switch (layer) {
    case 'tools': return { border: '#3b82f6', bg: 'rgba(59,130,246,0.10)' }
    case 'planning': return { border: '#10b981', bg: 'rgba(16,185,129,0.10)' }
    case 'memory': return { border: '#8b5cf6', bg: 'rgba(139,92,246,0.10)' }
    case 'concurrency': return { border: '#f59e0b', bg: 'rgba(245,158,11,0.10)' }
    case 'collaboration': return { border: '#ef4444', bg: 'rgba(239,68,68,0.10)' }
    default: return { border: '#71717a', bg: 'rgba(113,113,122,0.10)' }
  }
}

interface ClassEntry {
  name: string
  introducedIn: string
}

function collectClassesForVersion(targetId: string): ClassEntry[] {
  const list = versions.value?.versions ?? []
  const targetIndex = list.findIndex((v) => v.id === targetId)
  const version = targetIndex >= 0 ? list[targetIndex] : undefined
  if (!version) return []
  return (version.classes ?? []).map((cls) => ({
    name: cls.name,
    introducedIn:
      list.slice(0, targetIndex + 1).find((candidate) => candidate.classes?.some((c) => c.name === cls.name))?.id ??
      targetId,
  }))
}

function getNewClassNames(version: string): Set<string> {
  const diff = versions.value?.diffs.find((d) => d.to === version)
  if (!diff) {
    const v = versions.value?.versions.find((ver) => ver.id === version)
    return new Set(v?.classes?.map((c) => c.name) ?? [])
  }
  return new Set(diff.newClasses ?? [])
}

const allClasses = computed(() => collectClassesForVersion(props.labId))
const newClassNames = computed(() => getNewClassNames(props.labId))
const reversed = computed(() => [...allClasses.value].reverse())
const tools = computed(() => versions.value?.versions.find((v) => v.id === props.labId)?.tools ?? [])
</script>

<template>
  <div class="cc-arch">
    <template v-if="reversed.length === 0 && tools.length === 0">
      <div class="cc-arch__na">该章节暂无架构信息。</div>
    </template>
    <template v-else>
      <div class="cc-arch__list">
        <template v-for="(cls, i) in reversed" :key="cls.name">
          <div v-if="i > 0" class="cc-arch__link">
            <svg width="24" height="20" viewBox="0 0 24 20">
              <line x1="12" y1="0" x2="12" y2="14" stroke="var(--color-text-muted)" stroke-width="1.5" />
              <polygon points="7,12 12,19 17,12" fill="var(--color-text-muted)" />
            </svg>
          </div>
          <div
            class="cc-arch__card"
            :class="{ 'cc-arch__card--new': newClassNames.has(cls.name) }"
            :style="
              newClassNames.has(cls.name)
                ? { borderColor: layerColors(versions?.versions.find((v) => v.id === cls.introducedIn)?.layer ?? '').border, background: layerColors(versions?.versions.find((v) => v.id === cls.introducedIn)?.layer ?? '').bg }
                : undefined
            "
          >
            <div class="cc-arch__main">
              <span class="cc-arch__name" :class="{ 'cc-arch__name--new': newClassNames.has(cls.name) }">{{ cls.name }}</span>
              <p class="cc-arch__desc" :class="{ 'cc-arch__desc--new': newClassNames.has(cls.name) }">
                {{ CLASS_DESCRIPTIONS[cls.name] || '' }}
              </p>
            </div>
            <div class="cc-arch__meta">
              <span class="cc-arch__ver">{{ cls.introducedIn }}</span>
              <span v-if="newClassNames.has(cls.name)" class="cc-arch__new-badge">NEW</span>
            </div>
          </div>
        </template>

        <div v-if="reversed.length === 0" class="cc-arch__empty">本版本仅含函数。</div>
      </div>

      <div v-if="tools.length > 0" class="cc-arch__tools">
        <span v-for="tool in tools" :key="tool" class="cc-arch__tool">{{ tool }}</span>
      </div>
    </template>
  </div>
</template>

<style scoped lang="scss">
.cc-arch__na,
.cc-arch__empty {
  padding: 24px;
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-md);
  font-size: 14px;
  color: var(--color-text-muted);
}

.cc-arch__list {
  display: flex;
  flex-direction: column;
}

.cc-arch__link {
  display: flex;
  justify-content: center;
  padding: 4px 0;
}

.cc-arch__card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border: 2px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface-2);
  transition: border-color 0.2s, background 0.2s;
}

.cc-arch__card--new {
  border-width: 2px;
}

.cc-arch__main {
  min-width: 0;
}

.cc-arch__name {
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-muted);
}

.cc-arch__name--new {
  color: var(--color-text);
}

.cc-arch__desc {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--color-text-muted);
}

.cc-arch__desc--new {
  color: var(--color-text);
}

.cc-arch__meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.cc-arch__ver {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--color-text-muted);
}

.cc-arch__new-badge {
  padding: 2px 8px;
  border-radius: var(--radius-full);
  background: var(--color-text);
  color: var(--color-bg);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.cc-arch__tools {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding-top: 12px;
}

.cc-arch__tool {
  padding: 4px 10px;
  border-radius: var(--radius-sm);
  background: var(--color-surface-2);
  border: 1px solid var(--color-border-subtle);
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--color-text-muted);
}
</style>
