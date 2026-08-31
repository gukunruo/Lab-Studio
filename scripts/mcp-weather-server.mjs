#!/usr/bin/env node
// 真实天气 stdio MCP server —— 用 Open-Meteo（免费、无密钥）返回实时天气。
// 城市地理编码 + 当前天气，支持中文/英文城市名，结果按城市稳定且真实。
// 仅工具调用时才发网络请求；stdout 只走 MCP 协议，日志一律写 stderr。

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod/v4'

const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search'
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'

// WMO 天气代码 → 中文描述
const WMO_LABEL = {
  0: '晴',
  1: '基本晴朗',
  2: '局部多云',
  3: '阴',
  45: '雾',
  48: '雾凇',
  51: '小毛毛雨',
  53: '毛毛雨',
  55: '细雨',
  56: '冻毛毛雨',
  57: '冻毛毛雨',
  61: '小雨',
  63: '中雨',
  65: '大雨',
  66: '冻雨',
  67: '冻雨',
  71: '小雪',
  73: '中雪',
  75: '大雪',
  77: '雪粒',
  80: '小阵雨',
  81: '阵雨',
  82: '强阵雨',
  85: '小阵雪',
  86: '强阵雪',
  95: '雷阵雨',
  96: '雷阵雨伴小冰雹',
  99: '雷阵雨伴大冰雹',
}

function describeCode(code) {
  return WMO_LABEL[code] ?? `天气代码 ${code}`
}

// 去掉常见行政区后缀，提高 geocoding 命中率（「北京市」→「北京」）。
function normalizeCity(city) {
  return String(city).trim().replace(/(市|县|区|省|自治区|特别行政区)$/u, '').trim()
}

async function geocode(city) {
  const q = normalizeCity(city)
  const url = new URL(GEOCODING_URL)
  url.searchParams.set('name', q)
  url.searchParams.set('count', '1')
  url.searchParams.set('language', 'zh')
  url.searchParams.set('format', 'json')
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
  if (!res.ok) throw new Error(`地理编码失败（HTTP ${res.status}）`)
  const data = await res.json()
  const hit = data?.results?.[0]
  if (!hit) throw new Error(`未找到城市「${city}」`)
  return hit
}

// 把相对/绝对日期归一化成 Open-Meteo 需要的 YYYY-MM-DD；非法返回 null。
function normalizeDate(raw) {
  if (!raw) return null
  const s = String(raw).trim()
  const m = s.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?$/)
  if (!m) return null
  const [, y, mo, d] = m
  const dt = new Date(`${y}-${mo}-${d}T00:00:00`)
  if (Number.isNaN(dt.getTime())) return null
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
}

// 当前实时天气（无 date/days 时）：Open-Meteo 最新一轮观测，约 15 分钟间隔。
async function getCurrentWeather(place, country) {
  const url = new URL(FORECAST_URL)
  url.searchParams.set('latitude', String(place.latitude))
  url.searchParams.set('longitude', String(place.longitude))
  url.searchParams.set('current', 'temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m')
  url.searchParams.set('wind_speed_unit', 'kmh')
  url.searchParams.set('timezone', 'auto') // 让 current.time 落在城市本地时区，用户才能看出是「今天」。
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
  if (!res.ok) throw new Error(`天气预报失败（HTTP ${res.status}）`)
  const data = await res.json()
  const cur = data.current
  const celsius = cur.temperature_2m
  const label = describeCode(cur.weather_code)
  const c = place.country ?? country ?? ''
  const cityLabel = place.name
  // current.time 是模型最新一轮(约 15 分钟间隔)的观测时刻，本地时区。带上它，用户能判断是今天而不是旧数据。
  const observedAt = String(cur.time)
  const tzAbbr = data.timezone_abbreviation ?? ''
  const observedLabel = `${observedAt.replace('T', ' ')}${tzAbbr ? `（${tzAbbr}）` : ''}`
  const structuredContent = {
    mode: 'current',
    city: cityLabel,
    country: c,
    latitude: place.latitude,
    longitude: place.longitude,
    observedAt,
    timezone: tzAbbr,
    temperature: {
      celsius,
      fahrenheit: Math.round(((celsius * 9) / 5 + 32) * 10) / 10,
    },
    conditions: label,
    humidity: cur.relative_humidity_2m,
    wind: { speed_kmh: cur.wind_speed_10m },
  }
  const text = `${cityLabel}${c ? `（${c}）` : ''}截至 ${observedLabel}的天气：${label}，气温 ${celsius}°C，湿度 ${cur.relative_humidity_2m}%，风速 ${cur.wind_speed_10m} km/h。`
  return { content: [{ type: 'text', text }], structuredContent }
}

// 某一天 / 未来几天：Open-Meteo daily（最高/最低/天气状况/最大风速）。
async function getDailyWeather(place, country, date, days) {
  const url = new URL(FORECAST_URL)
  url.searchParams.set('latitude', String(place.latitude))
  url.searchParams.set('longitude', String(place.longitude))
  url.searchParams.set('timezone', 'auto')
  url.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min,wind_speed_10m_max')
  url.searchParams.set('wind_speed_unit', 'kmh')
  if (date) {
    url.searchParams.set('start_date', date)
    url.searchParams.set('end_date', date)
  } else {
    const n = Math.min(Math.max(1, Math.floor(Number(days) || 1)), 16)
    url.searchParams.set('forecast_days', String(n))
  }
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
  if (!res.ok) throw new Error(`天气预报失败（HTTP ${res.status}）`)
  const data = await res.json()
  const daily = data.daily
  const rows = (daily.time ?? []).map((t, i) => ({
    date: t,
    conditions: describeCode(daily.weather_code?.[i]),
    temperature: { max: daily.temperature_2m_max?.[i], min: daily.temperature_2m_min?.[i] },
    wind: { speed_kmh_max: daily.wind_speed_10m_max?.[i] },
  }))
  if (rows.length === 0) throw new Error('该日期没有可查询的天气数据')
  const c = place.country ?? country ?? ''
  const cityLabel = place.name
  const tzAbbr = data.timezone_abbreviation ?? ''
  const line = (r) => `- ${r.date}：${r.conditions}，最高 ${r.temperature.max}°C，最低 ${r.temperature.min}°C，最大风 ${r.wind.speed_kmh_max} km/h`
  const text = rows.length === 1
    ? `${cityLabel}${c ? `（${c}）` : ''}${rows[0].date} 天气：${rows[0].conditions}，最高 ${rows[0].temperature.max}°C，最低 ${rows[0].temperature.min}°C${tzAbbr ? `（${tzAbbr}）` : ''}。`
    : `${cityLabel}${c ? `（${c}）` : ''}未来 ${rows.length} 天天气${tzAbbr ? `（${tzAbbr}）` : ''}：\n${rows.map(line).join('\n')}`
  const structuredContent = {
    mode: 'daily',
    city: cityLabel,
    country: c,
    timezone: tzAbbr,
    days: rows.length,
    daily: rows,
  }
  return { content: [{ type: 'text', text }], structuredContent }
}

async function getWeather(city, country, date, days) {
  const place = await geocode(city)
  const normalized = normalizeDate(date)
  if (date && !normalized) throw new Error(`日期格式无效：${date}，应为 YYYY-MM-DD（如 2026-08-30）`)
  if (normalized) return getDailyWeather(place, country, normalized, days)
  if (days !== undefined && days !== null && Number(days) > 0) return getDailyWeather(place, country, null, days)
  return getCurrentWeather(place, country)
}

const server = new McpServer({
  name: 'open-meteo-weather',
  version: '1.0.0',
})

server.registerTool(
  'get_weather',
  {
    description:
      '查询指定城市的天气。三种模式：①不带 date/days 时返回「当前实时天气」（天气状况、气温、湿度、风速，附观测时刻，约 15 分钟间隔）；②传 date（YYYY-MM-DD）返回「某一天的天气」（最高/最低温、状况、最大风速）；③传 days（1-16）返回「未来 N 天的每日天气」。city 传城市名（支持中文或英文，如「北京」或「Beijing」），country 可选国家代码（如 CN）。',
    inputSchema: {
      city: z.string().describe('城市名，中文或英文均可'),
      country: z.string().optional().describe('国家代码，可选（如 CN、US）'),
      date: z.string().optional().describe('要查询的具体日期，格式 YYYY-MM-DD（如 2026-08-30），缺省时返回当前实时天气'),
      days: z.number().int().min(1).max(16).optional().describe('返回未来 N 天（1-16）的每日天气，与 date 互斥'),
    },
  },
  async ({ city, country, date, days }) => {
    try {
      return await getWeather(city, country, date, days)
    } catch (error) {
      // 失败时返回可读文本而非抛错，让模型能转述给用户。
      const message = error instanceof Error ? error.message : String(error)
      return {
        content: [{ type: 'text', text: `（天气查询失败：${message}）` }],
        isError: false,
      }
    }
  },
)

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('Open-Meteo weather MCP server running on stdio')
}

main().catch((error) => {
  console.error('Open-Meteo weather server error:', error)
  process.exit(1)
})
