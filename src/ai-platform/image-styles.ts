export interface ImageStyle {
  id: string
  name: string
  suffix: string
  image?: string
}

// 风格清单对齐豆包（32 个），每个带缩略图 icon；suffix 是我们自研引擎（gpt-image / gemini）
// 能跑的英文风格指令，不是豆包 Seedream 专属文案。id 与 /ai-styles/style-<id>.webp 同名。
export const IMAGE_STYLES: ImageStyle[] = [
  { id: 'portrait', name: '人像摄影', suffix: '，专业人像摄影，写实肤质，自然光影，浅景深，杂志人像质感', image: '/ai-styles/style-portrait.webp' },
  { id: 'film', name: '电影写真', suffix: '，电影级写真，电影感调光，氛围感，柔和胶片颗粒', image: '/ai-styles/style-film.webp' },
  { id: 'chinese', name: '中国风', suffix: '，中国风，东方美学元素，淡雅古典，意境留白', image: '/ai-styles/style-chinese.webp' },
  { id: 'japanese_anime', name: '动漫', suffix: '，日系动漫风格，明亮清新，线条干净，二次元质感', image: '/ai-styles/style-japanese_anime.webp' },
  { id: '3d', name: '3D 渲染', suffix: '，三维渲染风格，柔和光影，干净材质，类似 C4D/Blender 渲染', image: '/ai-styles/style-3d.webp' },
  { id: 'cyberpunk', name: '赛博朋克', suffix: '，赛博朋克风格，霓虹灯，紫蓝配色，未来都市氛围', image: '/ai-styles/style-cyberpunk.webp' },
  { id: 'cg', name: 'CG 动画', suffix: '，CG 动画风格，精致建模，高光通透，动画电影质感', image: '/ai-styles/style-cg.webp' },
  { id: 'ink_wash_painting', name: '水墨画', suffix: '，中国水墨画风格，笔墨淋漓，留白意境，淡雅宣纸质感', image: '/ai-styles/style-ink_wash_painting.webp' },
  { id: 'oil_painting', name: '油画', suffix: '，油画风格，厚涂笔触，肌理丰富，古典油画质感', image: '/ai-styles/style-oil_painting.webp' },
  { id: 'classic', name: '古典', suffix: '，古典主义风格，端庄典雅，柔和的伦勃朗光，文艺复兴油画气质', image: '/ai-styles/style-classic.webp' },
  { id: 'watercolor', name: '水彩画', suffix: '，水彩手绘风格，柔和晕染，透明水彩质感，纸面肌理', image: '/ai-styles/style-watercolor.webp' },
  { id: 'cartoon', name: '卡通', suffix: '，卡通风格，圆润可爱，明亮色彩，扁平高饱和', image: '/ai-styles/style-cartoon.webp' },
  { id: 'flat_illustration', name: '平面插画', suffix: '，扁平矢量插画风格，简洁色块，几何造型', image: '/ai-styles/style-flat_illustration.webp' },
  { id: 'landscape', name: '风景', suffix: '，风景绘画风格，开阔构图，自然光影，写生质感', image: '/ai-styles/style-landscape.webp' },
  { id: 'hongkong_anime', name: '港风动漫', suffix: '，港风动漫，复古质感，艳丽配色，怀旧氛围', image: '/ai-styles/style-hongkong_anime.webp' },
  { id: 'pixel_style', name: '像素风格', suffix: '，像素画风格，8-bit 像素颗粒，复古游戏质感', image: '/ai-styles/style-pixel_style.webp' },
  { id: 'fluorescence', name: '荧光绘画', suffix: '，荧光绘画风格，夜光霓虹，黑底亮色，发光质感', image: '/ai-styles/style-fluorescence.webp' },
  { id: 'colored_pencil', name: '彩铅画', suffix: '，彩色铅笔手绘风格，细腻排线，纸面肌理，清新手工感', image: '/ai-styles/style-colored_pencil.webp' },
  { id: 'figure', name: '手办', suffix: '，手办雕像风格，精致涂装，树脂质感，模型摄影打光', image: '/ai-styles/style-figure.webp' },
  { id: 'children_illustration', name: '儿童绘画', suffix: '，儿童插画风格，童趣稚拙，蜡笔质感，明快色彩', image: '/ai-styles/style-children_illustration.webp' },
  { id: 'abstract', name: '抽象', suffix: '，抽象艺术风格，几何构成，大胆配色，自由笔触', image: '/ai-styles/style-abstract.webp' },
  { id: 'sharp_illustration', name: '锐笔插画', suffix: '，锐利线条插画，硬朗笔触，高对比，现代图形感', image: '/ai-styles/style-sharp_illustration.webp' },
  { id: 'acg', name: '二次元', suffix: '，二次元插画风格，精致上色，赛璐璐光影，日系角色', image: '/ai-styles/style-acg.webp' },
  { id: 'ink_print', name: '油墨印刷', suffix: '，油墨印刷风格，套色版画，网点肌理，复古印刷感', image: '/ai-styles/style-ink_print.webp' },
  { id: 'bnw_printing', name: '版画', suffix: '，黑白版画风格，木刻刀痕，黑白灰层次，浮雕质感', image: '/ai-styles/style-bnw_printing.webp' },
  { id: 'monet', name: '莫奈', suffix: '，印象派风格，莫奈画风，光影斑驳，柔和笔触，油画质感', image: '/ai-styles/style-monet.webp' },
  { id: 'picasso', name: '毕加索', suffix: '，立体主义风格，毕加索画风，几何解构，大胆抽象', image: '/ai-styles/style-picasso.webp' },
  { id: 'rembrandt', name: '伦勃朗', suffix: '，伦勃朗式光影，明暗对比强烈，油画质感，古典肖像', image: '/ai-styles/style-rembrandt.webp' },
  { id: 'matisse', name: '马蒂斯', suffix: '，野兽派风格，马蒂斯画风，纯色块，装饰性线条', image: '/ai-styles/style-matisse.webp' },
  { id: 'baroque', name: '巴洛克', suffix: '，巴洛克风格，华丽繁复，戏剧性光影，庄严神圣', image: '/ai-styles/style-baroque.webp' },
  { id: 'oldschool', name: '复古动漫', suffix: '，复古动漫风格，怀旧色调，经典赛璐璐，八九十年代画风', image: '/ai-styles/style-oldschool.webp' },
  { id: 'picturebook', name: '绘本', suffix: '，绘本插画风格，柔和肌理，温馨童趣，手绘质感', image: '/ai-styles/style-picturebook.webp' },
]

const styleById = new Map(IMAGE_STYLES.map((s) => [s.id, s]))

export function imageStyleSuffix(id?: string): string {
  if (!id) return ''
  return styleById.get(id)?.suffix ?? ''
}

export function imageStyleName(id?: string): string {
  if (!id) return ''
  return styleById.get(id)?.name ?? ''
}

export function composeImagePrompt(prompt: string, styleId?: string): string {
  const suffix = imageStyleSuffix(styleId)
  return suffix ? `${prompt}${suffix}` : prompt
}
