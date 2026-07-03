import type { Component } from 'vue'

export type LocalizedString = { zh: string; en: string }

export interface ExperimentMetaInput {
  title: LocalizedString
  description: LocalizedString
  tags?: string[]
  date?: string
  icon?: string
}

export interface ExperimentMeta extends Required<Omit<ExperimentMetaInput, 'icon'>> {
  slug: string
  icon?: string
  component: () => Promise<Component>
}

const metaModules = import.meta.glob<ExperimentMetaInput>('./*/meta.ts', {
  eager: true,
  import: 'default',
})

const entryModules = import.meta.glob<Component>('./*/index.vue', {
  import: 'default',
})

function slugFromPath(path: string): string {
  return path.split('/').at(-2) ?? path
}

export const experiments: ExperimentMeta[] = Object.entries(metaModules)
  .map(([path, meta]): ExperimentMeta | null => {
    const entryPath = path.replace(/meta\.ts$/, 'index.vue')
    const component = entryModules[entryPath]
    if (!component) return null
    return {
      slug: slugFromPath(path),
      component,
      title: meta.title,
      description: meta.description,
      tags: meta.tags ?? [],
      date: meta.date ?? '',
      icon: meta.icon,
    }
  })
  .filter((e): e is ExperimentMeta => e !== null)
  .sort((a, b) => b.date.localeCompare(a.date))
