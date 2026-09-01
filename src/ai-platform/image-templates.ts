import type { ImageAspectRatio } from './types'

export interface ImageTemplate {
  id: string
  name: string
  prompt: string
  image?: string
  aspectRatio?: ImageAspectRatio
  style?: string
}

export const IMAGE_TEMPLATES: ImageTemplate[] = [
  {
    id: 'seaside-poster',
    name: '拼贴风海边画报',
    prompt: '拼贴风海边画报，竖版构图。\n\n• 背景：外框是淡蓝色，中间是撕边的浅蓝水彩晕染底色，带颗粒质感。\n\n• 文字：多条蓝色手写英文斜向排列，搭配黑色手写中文「奔赴海边，和夏天撞个满怀」，下方小字「海浪、沙滩、落日，所有烦恼都被海风带走」。\n\n• 装饰元素：海浪线条、贝壳贴纸、椰子树剪影，右下角是一只躺在沙滩上的遮阳伞剪影。\n\n• 底部标签：「海边度假画报」「100次·说走就走·旅行」，整体清爽治愈，充满夏日松弛感。',
    image: '/ai-templates/tpl-seaside-poster.webp',
    aspectRatio: '3:4',
  },
  {
    id: 'rabbit-sticker',
    name: '治愈系毛绒刺绣贴纸',
    prompt: '治愈系毛绒刺绣风卡通贴纸海报，淡紫色背景，仿毛线刺绣肌理，色彩明亮活泼。\n错落排布多套造型的兔子贴纸：穿碎花裙的兔子、戴花环帽的兔子、抱郁金香的兔子，搭配刺绣花草元素：郁金香、樱花、小雏菊。\n点缀手写短句：「Spring Day」「Blossom」「Hop~」，整体软乎乎的童趣感，无AI过度平滑，保留刺绣原生质感。',
    image: '/ai-templates/tpl-rabbit-sticker.webp',
    aspectRatio: '3:4',
  },
  {
    id: 'moebius-float',
    name: '莫比斯·空中浮岛',
    prompt: 'Moebius (Jean Giraud) 风格，极繁主义，莫比斯风格插画，艺术家 Moebius 风格，极致细节，悬浮在空中的巨型岩石浮岛，参天的拱门建筑，空中楼阁，色彩丰富的异域民居，垂直相连的悬空天桥，飞艇码头，色彩层次丰富的建筑外墙，浮岛上的运河一角，淡蓝色透明的空中溪流，淡蓝色的能量水晶，淡紫色的漂浮圆石，瀑布般垂下的藤蔓植物，画面细腻耐看，宁静美好，爬山虎，空中花园，爬藤月季，牵牛花，紫藤花，夜来香，凌霄花，淡紫色和粉色的空中花卉，淡蓝色的奇异花草。',
    image: '/ai-templates/tpl-moebius-float.webp',
    aspectRatio: '16:9',
  },
  {
    id: 'picturebook',
    name: '夏日绘本分享会',
    prompt: '扁平卡通插画，粗线条手绘风格，浅蓝+浅黄配色，清新活泼。\n画面中心是圆形野餐垫，周围围着手拿绘本、笔记本的小朋友，还有一只趴在书上的小柯基。垫上摆着绘本、汽水和小零食，散落着气球、风车、小书本等元素。\n文字排版：\n\n• 主标题：夏日绘本分享会\n\n• 副标题：和绘本一起过夏天\n\n• 时间：6月8日 - 6月22日 \n\n• 底部小字：儿童绘本共读活动，一起在故事里找夏天。',
    image: '/ai-templates/tpl-picturebook.webp',
    aspectRatio: '3:4',
  },
  {
    id: 'watermelon-summer',
    name: '西瓜味的夏天',
    prompt: '竖版海报，明亮高饱和配色，马克笔手绘质感。\n\n• 背景：卡通西瓜切片、冰棍、太阳涂鸦，铺满浅黄底色，线条活泼随性。\n\n• 文字排版：\n\n◦ 主标题（圆润卡通字）：西瓜味的夏天\n\n◦ 小字：空调+西瓜=快乐夏天\n\n◦ 角落涂鸦：小太阳+爱心\n\n• 氛围：元气搞怪，适合朋友圈或活动海报。',
    image: '/ai-templates/tpl-watermelon-summer.webp',
    aspectRatio: '3:4',
  },
  {
    id: 'rich-logo',
    name: '国潮书法·日进斗金',
    prompt: '国潮毛笔书法字体LOGO，粗粝飞白笔触+水墨肌理，国风高级感。\n居中主标题大字：「日进斗金」，搭配金币、钱包小插画，左上角红色印章「暴富」。\n底部毛笔拼音/英文：「Ri Jin Dou Jin」，白色背景，水墨质感，力量感拉满，适配搞钱标语设计。',
    image: '/ai-templates/tpl-rich-logo.webp',
    aspectRatio: '3:4',
  },
  {
    id: 'logo-grid',
    name: '九宫格·品牌LOGO',
    prompt: '整体风格：简约粗轮廓线条logo，圆润高级扁平化，单张图标准3×3九宫格，9枚独立品牌logo，每一个自带搭配文字，配色互不重复，纹理细腻，图形元素丰富，商用设计感，统一画风，超高细节。\n1.月亮猫咪LOGO，搭配文字「MOON CAT」，紫灰渐变底色，星月线条纹路，慵懒极简造型\n2.云朵小熊LOGO，搭配文字「SOFT BEAR」，奶白色浅蓝底色，蓬松肌理，柔和光影层次\n3.星光狐狸LOGO，搭配文字「STAR FOX」，暗夜藏蓝底色，细碎星光装饰，高级精致\n4.山茶小兔LOGO，搭配文字「FLOWER BUN」，淡粉柔色底色，花瓣纹理环绕，温柔治愈\n5.机车黑豹LOGO，搭配文字「BLACK SPEED」，哑光深灰底色，机械线条细节，酷感极简\n6.海盐海豚LOGO，搭配文字「SEA DOLPHIN」，清透青蓝底色，水波纹路，简约流畅\n7.烘焙小猫LOGO，搭配文字「SWEET BAKE」，焦糖浅棕底色，甜点细碎装饰，细腻质感\n8.森林小鹿LOGO，搭配文字「DEER WOOD」，墨绿色底色，叶脉纹理点缀，自然高级\n9.霓虹猫头鹰LOGO，搭配文字「NIGHT OWL」，酒红哑光底色，几何边框，潮流设计。',
    image: '/ai-templates/tpl-logo-grid.webp',
    aspectRatio: '3:4',
  },
]
