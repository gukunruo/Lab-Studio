import type { ImageAspectRatio } from './types'

export interface ImageTemplate {
  id: string
  name: string
  prompt: string
  aspectRatio?: ImageAspectRatio
  style?: string
}

export const IMAGE_TEMPLATES: ImageTemplate[] = [
  { id: 'city-night', name: '霓虹都市夜景', prompt: '一座未来感十足的赛博朋克城市夜景，雨后的街道反光，高楼霓虹闪烁，行人撑伞', aspectRatio: '16:9', style: 'cyberpunk' },
  { id: 'ink-mountain', name: '水墨山水', prompt: '中国水墨风格的山水，远山近树，云雾缭绕，留白意境', aspectRatio: '4:3', style: 'ink-wash' },
  { id: 'product-3d', name: '产品 3D 渲染', prompt: '一个极简工业设计产品，3D 渲染，柔和影棚光，白色背景，质感干净', aspectRatio: '1:1', style: '3d-render' },
  { id: 'cafe-watercolor', name: '水彩咖啡馆', prompt: '街角咖啡馆，水彩手绘风格，阳光洒进窗户，温暖色调', aspectRatio: '3:4', style: 'watercolor' },
  { id: 'space-cinema', name: '电影宇宙', prompt: '宇航员在壮丽星云前的剪影，电影感构图，大片质感', aspectRatio: '16:9', style: 'cinematic' },
  { id: 'minimal-poster', name: '极简海报', prompt: '一株盆栽在纯色背景上的极简海报，大量留白，克制配色', aspectRatio: '1:1', style: 'minimal' },
  { id: 'anime-girl', name: '日系插画', prompt: '少女在樱花树下，日系动漫插画，明亮清新，微风花瓣', aspectRatio: '3:4', style: 'anime' },
  { id: 'film-portrait', name: '复古肖像', prompt: '一张复古胶片质感的人像，暖调褪色，颗粒感，怀旧氛围', aspectRatio: '4:3', style: 'vintage-film' },
]
