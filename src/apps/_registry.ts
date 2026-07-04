import type { Component } from 'vue'

export type LocalizedString = { zh: string; en: string }

export interface AppMetaInput {
  title: LocalizedString
  description: LocalizedString
  tags?: string[]
  date?: string
  icon?: string
}

export interface AppMeta extends Required<Omit<AppMetaInput, 'icon'>> {
  slug: string
  icon?: string
  component: () => Promise<Component>
  doc?: string
}

const metaModules = import.meta.glob<AppMetaInput>('./*/meta.ts', {
  eager: true,
  import: 'default',
})

const entryModules = import.meta.glob<Component>('./*/index.vue', {
  import: 'default',
})

const docModules = import.meta.glob<string>('./*/doc.md', {
  eager: true,
  import: 'default',
  query: '?raw',
})

function slugFromPath(path: string): string {
  return path.split('/').at(-2) ?? path
}

export const apps: AppMeta[] = Object.entries(metaModules)
  .map(([path, meta]): AppMeta | null => {
    const entryPath = path.replace(/meta\.ts$/, 'index.vue')
    const component = entryModules[entryPath]
    if (!component) return null
    const docPath = path.replace(/meta\.ts$/, 'doc.md')
    return {
      slug: slugFromPath(path),
      component,
      title: meta.title,
      description: meta.description,
      tags: meta.tags ?? [],
      date: meta.date ?? '',
      icon: meta.icon,
      doc: docModules[docPath],
    }
  })
  .filter((e): e is AppMeta => e !== null)
  .sort((a, b) => b.date.localeCompare(a.date))
