export type ImageStyleId =
  | 'photorealistic'
  | '3d-render'
  | 'flat-illustration'
  | 'ink-wash'
  | 'cyberpunk'
  | 'cinematic'
  | 'minimal'
  | 'anime'
  | 'watercolor'
  | 'vintage-film'

export interface ImageStyle {
  id: ImageStyleId
  name: string
  suffix: string
  color: string
}

export const IMAGE_STYLES: ImageStyle[] = [
  { id: 'photorealistic', name: '写实摄影', suffix: '，真实摄影质感，自然光影，高细节真实感', color: '#8a6f4d' },
  { id: '3d-render', name: '3D 渲染', suffix: '，三维渲染风格，柔和光影，干净材质，类似 C4D/Blender 渲染', color: '#b9a9e8' },
  { id: 'flat-illustration', name: '扁平插画', suffix: '，扁平矢量插画风格，简洁色块，几何造型', color: '#ff8a65' },
  { id: 'ink-wash', name: '国风水墨', suffix: '，中国水墨画风格，笔墨淋漓，留白意境，淡雅宣纸质感', color: '#5b6770' },
  { id: 'cyberpunk', name: '赛博朋克', suffix: '，赛博朋克风格，霓虹灯，紫蓝配色，未来都市氛围', color: '#b26bff' },
  { id: 'cinematic', name: '电影质感', suffix: '，电影级画面，电影感调色，宽画幅电影构图', color: '#2f6f6f' },
  { id: 'minimal', name: '极简', suffix: '，极简风格，干净留白，单一主体，克制配色', color: '#c8c8c8' },
  { id: 'anime', name: '卡通动漫', suffix: '，日系动漫风格，明亮清新，线条干净，二次元质感', color: '#ff9ecb' },
  { id: 'watercolor', name: '水彩手绘', suffix: '，水彩手绘风格，柔和晕染，透明水彩质感，纸面肌理', color: '#8ec9e8' },
  { id: 'vintage-film', name: '复古胶片', suffix: '，复古胶片风格，颗粒感，暖调褪色，怀旧氛围', color: '#b5893f' },
]

const styleById = new Map(IMAGE_STYLES.map((s) => [s.id, s]))

export function imageStyleSuffix(id?: string): string {
  if (!id) return ''
  return styleById.get(id as ImageStyleId)?.suffix ?? ''
}

export function imageStyleName(id?: string): string {
  if (!id) return ''
  return styleById.get(id as ImageStyleId)?.name ?? ''
}

export function composeImagePrompt(prompt: string, styleId?: string): string {
  const suffix = imageStyleSuffix(styleId)
  return suffix ? `${prompt}${suffix}` : prompt
}
