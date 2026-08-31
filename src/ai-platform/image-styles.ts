import type { ImageDraftFacets } from './types'

// 风格预设：把用户「描述不好」的抽象风格，替换成图片模型真正吃的高质量风格词。
// 这是生图效果的最大杠杆——比「直接输入」强的关键，正是这些经过调优的预设词。
export interface StylePreset {
  id: string
  label: string
  style: string
}

export const STYLE_PRESETS: StylePreset[] = [
  { id: '3d', label: '3D 渲染', style: '3D渲染，Octane Render，体积光，高光反射，精细材质，电影级光影' },
  { id: 'flat', label: '扁平插画', style: '扁平矢量插画，几何化造型，鲜明色块，柔和渐变，干净留白' },
  { id: 'photo', label: '写实摄影', style: '写实摄影，单反，85mm 大光圈，浅景深，柔和自然光，真实质感' },
  { id: 'cinema', label: '电影质感', style: '电影镜头感，戏剧性打光，胶片颗粒，色彩分级，宽银幕构图' },
  { id: 'ink', label: '水墨国风', style: '水墨画，留白，写意笔触，淡墨晕染，国风意境' },
  { id: 'cyberpunk', label: '赛博朋克', style: '赛博朋克，霓虹光，雨夜都市，高饱和对比，未来科技感' },
  { id: 'minimal', label: '极简', style: '极简，大留白，简洁构图，单一主色，精致排版' },
  { id: 'skeuo', label: '拟物', style: '拟物写实，微距细节，真实材质，柔和阴影，高质感' },
  { id: 'pixel', label: '像素艺术', style: '像素艺术，16-bit 复古风格，清晰轮廓，有限色板' },
  { id: 'dreamy', label: '梦幻插画', style: '梦幻插画，柔光，童话氛围，细腻纹理，唯美色彩' },
]

// 负面预设：一键勾选常见要避免的元素，比手工写「避免」更省事、更稳。
export interface NegativePreset {
  id: string
  label: string
  negative: string
}

export const NEGATIVE_PRESETS: NegativePreset[] = [
  { id: 'blur', label: '模糊', negative: '模糊，失焦' },
  { id: 'text', label: '文字/水印', negative: '文字，水印，签名' },
  { id: 'deformed', label: '畸形', negative: '畸形，肢体错乱，多余手指' },
  { id: 'lowres', label: '低清', negative: '低分辨率，像素化，噪点' },
  { id: 'distort', label: '变形', negative: '比例失调，拉伸变形' },
]

// 画质增强：追加到 prompt 尾部的通用品质词，多数生图平台都用这类 booster 提画质。
export const QUALITY_BOOSTER = 'masterpiece，best quality，highly detailed，sharp focus，professional lighting，8k'

export function findStylePreset(id: string | null | undefined): StylePreset | undefined {
  return STYLE_PRESETS.find((preset) => preset.id === id)
}

export function applyStylePreset(facets: ImageDraftFacets, presetId: string): ImageDraftFacets {
  const preset = findStylePreset(presetId)
  return { ...facets, style: preset ? preset.style : '' }
}

export function clearStylePreset(facets: ImageDraftFacets): ImageDraftFacets {
  return { ...facets, style: '' }
}

// 判断当前 style 是否正好命中某个预设（用于 chips 高亮）。
export function activeStylePresetId(facets: ImageDraftFacets): string | null {
  const style = facets.style.trim()
  return STYLE_PRESETS.find((preset) => preset.style === style)?.id ?? null
}

function splitTerms(value: string): string[] {
  return value.split(/[，,、]/).map((item) => item.trim()).filter(Boolean)
}

function negativeTermSet(facets: ImageDraftFacets): Set<string> {
  return new Set(splitTerms(facets.negative))
}

// 一个预设可能含多个词（如「文字，水印，签名」），只要全部词都在即视为已生效。
export function isNegativeActive(facets: ImageDraftFacets, preset: NegativePreset): boolean {
  const existing = negativeTermSet(facets)
  return splitTerms(preset.negative).every((term) => existing.has(term))
}

export function toggleNegative(facets: ImageDraftFacets, preset: NegativePreset): ImageDraftFacets {
  const existing = negativeTermSet(facets)
  const terms = splitTerms(preset.negative)
  if (terms.every((term) => existing.has(term))) {
    let negative = facets.negative
    for (const term of terms) negative = negative.replace(term, '')
    return { ...facets, negative: negative.replace(/^[，,、\s]+|[，,、\s]+$/g, '').replace(/[，,]\s*[，,]/g, '，').trim() }
  }
  const missing = terms.filter((term) => !existing.has(term)).join('，')
  const current = facets.negative.trim()
  return { ...facets, negative: current ? `${current}，${missing}` : missing }
}

export function enhancePrompt(prompt: string): string {
  const trimmed = prompt.trim()
  return trimmed ? `${trimmed}\n画质：${QUALITY_BOOSTER}` : ''
}
