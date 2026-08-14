import { ref } from 'vue'
import type { BoardRow, Kline, MinutePoint, QuoteDetail, SearchItem } from './types'

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
    // 港股：5 位数字
    if (market === '116') return `hk${code.padStart(5, '0')}`
    // 基金（市场通常为 0/1 之外，如 OF）无腾讯实时行情；板块也无。
    return null
  }
  // 美股：纯字母代码
  if (/^[A-Za-z]+$/.test(code) && (market === '105' || market === '106' || market === '107')) {
    return `us${code.toUpperCase()}`
  }
  return null
}

export function useFinance() {
  // 搜索
  const query = ref('')
  const suggestions = ref<SearchItem[]>([])
  const searching = ref(false)

  // 重点板块（指数条）
  const boards = ref<BoardsData | null>(null)
  const boardsLoading = ref(false)

  // 板块排行（行业/概念）
  const boardKind = ref<'industry' | 'concept'>('industry')
  const boardOrder = ref<'up' | 'down'>('up')
  const boardRows = ref<BoardRow[]>([])
  const boardsRankLoading = ref(false)
  let boardLoadSeq = 0

  // 自选
  const watchlist = ref<WatchItem[]>([])
  const quotes = ref<Record<string, Quote>>({}) // symbol → quote

  // 选中标的详情（K 线）
  const selected = ref<SearchItem | null>(null)
  const klines = ref<Kline[]>([])
  const loading = ref(false)
  const error = ref('')
  const detail = ref<QuoteDetail | null>(null)

  // K 线周期：101=日 102=周 103=月；selectedSymbol 为指数/板块直传腾讯 symbol 时使用
  const klt = ref('101')
  const selectedSymbol = ref<string | null>(null)
  const selectedPlatecode = ref<string | null>(null)
  const minutePoints = ref<MinutePoint[]>([])

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

  async function loadBoardRank() {
    const seq = ++boardLoadSeq
    boardsRankLoading.value = true
    try {
      const res = await fetch(
        `/api/finance/boards/${boardKind.value}?order=${boardOrder.value}`,
        { credentials: 'include' },
      )
      const data = (await res.json().catch(() => null)) as { items?: BoardRow[]; error?: string } | null
      if (!res.ok) throw new Error(data?.error ?? '加载失败')
      if (seq !== boardLoadSeq) return
      boardRows.value = data?.items ?? []
    } catch {
      if (seq !== boardLoadSeq) return
      boardRows.value = []
    } finally {
      if (seq === boardLoadSeq) boardsRankLoading.value = false
    }
  }

  function setBoardKind(kind: 'industry' | 'concept') {
    if (boardKind.value === kind) return
    boardKind.value = kind
    void loadBoardRank()
  }

  function setBoardOrder(order: 'up' | 'down') {
    if (boardOrder.value === order) return
    boardOrder.value = order
    void loadBoardRank()
  }

  async function selectBoardRow(row: BoardRow) {
    const item: SearchItem = {
      quoteId: `90.${row.code}`,
      code: row.code,
      name: row.name,
      type: 'Board',
      typeName: row.kind === 'industry' ? '行业板块' : '概念板块',
      market: '90',
    }
    selected.value = item
    selectedSymbol.value = null
    selectedPlatecode.value = row.code
    suggestions.value = []
    detail.value = null
    klines.value = []
    klt.value = '101'
    await Promise.all([loadKline(), loadMinute()])
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

  // 腾讯实时详情 symbol（指数/个股/ETF）。板块、基金无此数据，返回 null。
  function detailSymbolOf(item: SearchItem): string | null {
    if (item.type === 'OTCFUND') return null
    const s = itemToSymbol(item)
    if (s) return s
    if (selectedSymbol.value) return selectedSymbol.value
    return null
  }

  async function loadDetail(item: SearchItem) {
    const symbol = detailSymbolOf(item)
    if (!symbol) {
      detail.value = null
      return
    }
    try {
      const res = await fetch(`/api/finance/detail?symbol=${encodeURIComponent(symbol)}`, {
        credentials: 'include',
      })
      const data = (await res.json().catch(() => null)) as QuoteDetail | { error?: string } | null
      if (!res.ok) throw new Error((data as { error?: string })?.error ?? '加载失败')
      detail.value = data as QuoteDetail
    } catch {
      detail.value = null
    }
  }

  async function select(item: SearchItem) {
    selected.value = item
    selectedSymbol.value = null
    selectedPlatecode.value = null
    suggestions.value = []
    query.value = item.name
    detail.value = null
    klines.value = []
    klt.value = '101'
    await Promise.all([loadKline(), loadDetail(item), loadMinute()])
  }

  // 重点板块卡片点击：直接用行情 Quote 触发 K 线
  function selectBoard(q: Quote) {
    const item: SearchItem = {
      quoteId: '',
      code: q.code,
      name: q.name,
      type: 'Index',
      typeName: '指数',
      market: '',
    }
    selected.value = item
    selectedSymbol.value = q.symbol
    selectedPlatecode.value = null
    suggestions.value = []
    detail.value = null
    klines.value = []
    klt.value = '101'
    void Promise.all([loadKlineForSymbol(q.symbol, item), loadDetail(item), loadMinute()])
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
      // 附带 code（美股/港股映射需要）与 symbol（重点板块直传）
      const params = new URLSearchParams({
        secid: item.quoteId || `0.${item.code}`,
        name: item.name,
        klt: klt.value,
        limit: '250',
      })
      if (item.code) params.set('code', item.code)
      const res = await fetch(`/api/finance/kline?${params.toString()}`, { credentials: 'include' })
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

  // 重点板块 K 线：直接传 symbol（如 us.DJI/hkHSI/sh000001），secid 用 symbol 占位
  async function loadKlineForSymbol(symbol: string, item: SearchItem) {
    const seq = ++loadSeq
    loading.value = true
    error.value = ''
    try {
      const res = await fetch(
        `/api/finance/kline?secid=${encodeURIComponent(symbol)}&name=${encodeURIComponent(item.name)}&symbol=${encodeURIComponent(symbol)}&klt=${klt.value}&limit=250`,
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

  // K 线周期切换（日/周/月），按当前选中标的重载
  async function setPeriod(period: 'day' | 'week' | 'month') {
    const next = period === 'week' ? '102' : period === 'month' ? '103' : '101'
    if (next === klt.value) return
    klt.value = next
    const item = selected.value
    if (!item) return
    if (item.type === 'OTCFUND') return // 基金无周/月净值
    if (selectedSymbol.value) {
      await loadKlineForSymbol(selectedSymbol.value, item)
    } else {
      await loadKline()
    }
  }

  // 分时：板块传 platecode 走同花顺，其余走腾讯 symbol
  async function loadMinute() {
    const item = selected.value
    if (!item) return
    if (item.type === 'OTCFUND') {
      minutePoints.value = []
      return
    }
    const params = new URLSearchParams()
    if (selectedPlatecode.value) {
      params.set('platecode', selectedPlatecode.value)
    } else if (selectedSymbol.value) {
      params.set('symbol', selectedSymbol.value)
    } else {
      const symbol = itemToSymbol(item)
      if (!symbol) {
        minutePoints.value = []
        return
      }
      params.set('symbol', symbol)
    }
    try {
      const res = await fetch(`/api/finance/minute?${params.toString()}`, { credentials: 'include' })
      const data = (await res.json().catch(() => null)) as { points?: MinutePoint[]; error?: string } | null
      if (!res.ok) throw new Error(data?.error ?? '加载失败')
      minutePoints.value = data?.points ?? []
    } catch {
      minutePoints.value = []
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
    boardKind,
    boardOrder,
    boardRows,
    boardsRankLoading,
    watchlist,
    quotes,
    selected,
    klines,
    detail,
    minutePoints,
    loading,
    error,
    search,
    scheduleSearch,
    loadBoards,
    loadBoardRank,
    setBoardKind,
    setBoardOrder,
    selectBoardRow,
    loadWatchlist,
    addWatch,
    removeWatch,
    select,
    selectBoard,
    loadKline,
    setPeriod,
    viewWatch,
  }
}
