import { ref } from 'vue'
import type { Kline, SearchItem } from './types'

export function useFinance() {
  const query = ref('')
  const suggestions = ref<SearchItem[]>([])
  const searching = ref(false)
  const selected = ref<SearchItem | null>(null)
  const klines = ref<Kline[]>([])
  const loading = ref(false)
  const error = ref('')

  let debounce: ReturnType<typeof setTimeout> | null = null

  async function search() {
    const q = query.value.trim()
    if (!q) {
      suggestions.value = []
      return
    }
    searching.value = true
    try {
      const res = await fetch(`/api/finance/search?q=${encodeURIComponent(q)}`, { credentials: 'include' })
      const data = (await res.json().catch(() => null)) as { items?: SearchItem[]; error?: string } | null
      if (!res.ok) throw new Error(data?.error ?? '搜索失败')
      suggestions.value = data?.items ?? []
    } catch (e) {
      suggestions.value = []
      error.value = e instanceof Error ? e.message : '搜索失败'
    } finally {
      searching.value = false
    }
  }

  function scheduleSearch() {
    if (debounce) clearTimeout(debounce)
    debounce = setTimeout(search, 250)
  }

  async function select(item: SearchItem) {
    selected.value = item
    suggestions.value = []
    query.value = item.name
    await loadKline()
  }

  async function loadKline() {
    const item = selected.value
    if (!item) return
    if (item.type === 'OTCFUND') {
      await loadFundNav(item)
      return
    }
    loading.value = true
    error.value = ''
    try {
      const res = await fetch(
        `/api/finance/kline?secid=${encodeURIComponent(item.quoteId)}&klt=101&limit=250`,
        { credentials: 'include' },
      )
      const data = (await res.json().catch(() => null)) as { klines?: Kline[]; error?: string } | null
      if (!res.ok) throw new Error(data?.error ?? '加载失败')
      klines.value = data?.klines ?? []
    } catch (e) {
      error.value = e instanceof Error ? e.message : '加载失败'
      klines.value = []
    } finally {
      loading.value = false
    }
  }

  async function loadFundNav(item: SearchItem) {
    loading.value = true
    error.value = ''
    try {
      const res = await fetch(
        `/api/finance/fund/nav?code=${encodeURIComponent(item.code)}&limit=250`,
        { credentials: 'include' },
      )
      const data = (await res.json().catch(() => null)) as {
        nav?: Array<{ date: string; nav: number; accNav: number; pct: number }>
        error?: string
      } | null
      if (!res.ok) throw new Error(data?.error ?? '加载失败')
      // 场外净值转成伪 K 线（open/high/low/close 均取单位净值），让图表复用。
      klines.value = (data?.nav ?? []).map((p) => ({
        date: p.date,
        open: p.nav,
        close: p.nav,
        high: p.nav,
        low: p.nav,
        volume: 0,
        amount: 0,
        amplitude: 0,
        pct: p.pct,
        change: 0,
        turnover: 0,
      }))
    } catch (e) {
      error.value = e instanceof Error ? e.message : '加载失败'
      klines.value = []
    } finally {
      loading.value = false
    }
  }

  return {
    query,
    suggestions,
    searching,
    selected,
    klines,
    loading,
    error,
    search,
    scheduleSearch,
    select,
    loadKline,
  }
}
