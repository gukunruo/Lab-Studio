import { ref } from 'vue'
import type { Kline, SearchItem } from './types'

export interface Quote {
  symbol: string
  name: string
  code: string
  price: number
  prevClose: number
  change: number
  pct: number
  open: number
  high: number
  low: number
  volume: number
  amount: number
  time: string
}

export interface WatchItem {
  id: number
  userKey: string
  quoteId: string
  code: string
  name: string
  type: string
  typeName: string
  market: string
  createdAt: number
}

export interface BoardsData {
  domestic: Quote[]
  overseas: Quote[]
  industries: Array<{ name: string; pct: number }>
}

// 把自选项映射成腾讯 symbol，用于批量实时行情刷新。
export function itemToSymbol(item: SearchItem | WatchItem): string | null {
  const code = item.code
  const market = item.market
  if (/^\d{6}$/.test(code)) {
    if (market === '1') return `sh${code}`
    if (market === '0') return `sz${code}`
    // 基金（市场通常为 0/1 之外，如 OF）无腾讯实时行情；板块也无。
    return null
  }
  return null
}

export function useFinance() {
  // 搜索
  const query = ref('')
  const suggestions = ref<SearchItem[]>([])
  const searching = ref(false)

  // 重点板块
  const boards = ref<BoardsData | null>(null)
  const boardsLoading = ref(false)

  // 自选
  const watchlist = ref<WatchItem[]>([])
  const quotes = ref<Record<string, Quote>>({}) // symbol → quote

  // 选中标的详情（K 线）
  const selected = ref<SearchItem | null>(null)
  const klines = ref<Kline[]>([])
  const loading = ref(false)
  const error = ref('')

  let debounce: ReturnType<typeof setTimeout> | null = null
  let loadSeq = 0

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
    } catch {
      suggestions.value = []
    } finally {
      searching.value = false
    }
  }

  function scheduleSearch() {
    if (debounce) clearTimeout(debounce)
    debounce = setTimeout(search, 250)
  }

  async function loadBoards() {
    boardsLoading.value = true
    try {
      const res = await fetch('/api/finance/boards', { credentials: 'include' })
      const data = (await res.json().catch(() => null)) as BoardsData | { error?: string } | null
      if (!res.ok) throw new Error((data as { error?: string })?.error ?? '加载失败')
      boards.value = data as BoardsData
    } catch {
      boards.value = null
    } finally {
      boardsLoading.value = false
    }
  }

  async function loadWatchlist() {
    try {
      const res = await fetch('/api/finance/watchlist', { credentials: 'include' })
      const data = (await res.json().catch(() => null)) as { items?: WatchItem[] } | null
      watchlist.value = data?.items ?? []
    } catch {
      watchlist.value = []
    }
    await refreshQuotes()
  }

  async function refreshQuotes() {
    const symbols = watchlist.value
      .map((w) => itemToSymbol(w))
      .filter((s): s is string => s != null)
    if (!symbols.length) return
    try {
      const res = await fetch(`/api/finance/quote?symbols=${encodeURIComponent(symbols.join(','))}`, {
        credentials: 'include',
      })
      const data = (await res.json().catch(() => null)) as { quotes?: Quote[] } | null
      const map: Record<string, Quote> = {}
      for (const q of data?.quotes ?? []) map[q.symbol] = q
      quotes.value = map
    } catch {
      /* 行情刷新失败不阻塞列表展示 */
    }
  }

  async function addWatch(item: SearchItem) {
    try {
      const res = await fetch('/api/finance/watchlist', {
        credentials: 'include',
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          quoteId: item.quoteId,
          code: item.code,
          name: item.name,
          type: item.type,
          typeName: item.typeName,
          market: item.market,
        }),
      })
      if (res.ok) await loadWatchlist()
    } catch {
      /* 添加失败静默，前端可重试 */
    }
  }

  async function removeWatch(id: number) {
    try {
      await fetch(`/api/finance/watchlist/${id}`, { credentials: 'include', method: 'DELETE' })
      await loadWatchlist()
    } catch {
      /* 删除失败静默 */
    }
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
    const seq = ++loadSeq
    loading.value = true
    error.value = ''
    try {
      const res = await fetch(
        `/api/finance/kline?secid=${encodeURIComponent(item.quoteId)}&name=${encodeURIComponent(item.name)}&klt=101&limit=250`,
        { credentials: 'include' },
      )
      const data = (await res.json().catch(() => null)) as { klines?: Kline[]; error?: string } | null
      if (!res.ok) throw new Error(data?.error ?? '加载失败')
      if (seq !== loadSeq) return
      klines.value = data?.klines ?? []
    } catch (e) {
      if (seq !== loadSeq) return
      error.value = e instanceof Error ? e.message : '加载失败'
      klines.value = []
    } finally {
      if (seq === loadSeq) loading.value = false
    }
  }

  async function loadFundNav(item: SearchItem) {
    const seq = ++loadSeq
    loading.value = true
    error.value = ''
    try {
      const res = await fetch(`/api/finance/fund/nav?code=${encodeURIComponent(item.code)}&limit=250`, {
        credentials: 'include',
      })
      const data = (await res.json().catch(() => null)) as {
        nav?: Array<{ date: string; nav: number; accNav: number; pct: number }>
        error?: string
      } | null
      if (!res.ok) throw new Error(data?.error ?? '加载失败')
      if (seq !== loadSeq) return
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
      if (seq !== loadSeq) return
      error.value = e instanceof Error ? e.message : '加载失败'
      klines.value = []
    } finally {
      if (seq === loadSeq) loading.value = false
    }
  }

  // 从自选列表点「查看」：把 WatchItem 转成 SearchItem 再加载
  function viewWatch(item: WatchItem) {
    void select({
      quoteId: item.quoteId,
      code: item.code,
      name: item.name,
      type: item.type,
      typeName: item.typeName,
      market: item.market,
    })
  }

  return {
    query,
    suggestions,
    searching,
    boards,
    boardsLoading,
    watchlist,
    quotes,
    selected,
    klines,
    loading,
    error,
    search,
    scheduleSearch,
    loadBoards,
    loadWatchlist,
    addWatch,
    removeWatch,
    select,
    loadKline,
    viewWatch,
  }
}
