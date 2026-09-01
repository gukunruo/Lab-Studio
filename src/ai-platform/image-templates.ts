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
    id: 'moebius-float',
    name: '莫比斯·空中浮岛',
    prompt: 'Moebius (Jean Giraud) 风格，极繁主义，莫比斯风格插画，艺术家 Moebius 风格，极致细节，悬浮在空中的巨型岩石浮岛，参天的拱门建筑，空中楼阁，色彩丰富的异域民居，垂直相连的悬空天桥，飞艇码头，色彩层次丰富的建筑外墙，浮岛上的运河一角，淡蓝色透明的空中溪流，淡蓝色的能量水晶，淡紫色的漂浮圆石，瀑布般垂下的藤蔓植物，画面细腻耐看，宁静美好，爬山虎，空中花园，爬藤月季，牵牛花，紫藤花，夜来香，凌霄花，淡紫色和粉色的空中花卉，淡蓝色的奇异花草。',
    image: '/ai-templates/tpl-moebius-float.webp',
    aspectRatio: '16:9',
  },
  {
    id: 'plush-stickers',
    name: '3D毛绒潮玩贴纸',
    prompt: '3D 毛绒质感潮玩贴纸集合，纯白色背景，四组毛绒人物元素分区域排版：戴明黄色针织帽的男生举着橙色带笑脸的相机，穿黄色套装的女生从棕色礼盒里探出头，粉紫色头发女生躺在棕色月牙沙发上玩手机，圣诞帽男生坐在绿色月亮上拿着苹果，毛绒纹理清晰细腻，色彩活泼明亮，可爱治愈 3D 风格，方版构图。',
    image: '/ai-templates/tpl-plush-stickers.webp',
    aspectRatio: '3:4',
  },
  {
    id: 'logo-grid',
    name: '九宫格·品牌LOGO',
    prompt: '整体风格：简约粗轮廓线条logo，圆润高级扁平化，单张图标准3×3九宫格，9枚独立品牌logo，每一个自带搭配文字，配色互不重复，纹理细腻，图形元素丰富，商用设计感，统一画风，超高细节。\n1.月亮猫咪LOGO，搭配文字「MOON CAT」，紫灰渐变底色，星月线条纹路，慵懒极简造型\n2.云朵小熊LOGO，搭配文字「SOFT BEAR」，奶白色浅蓝底色，蓬松肌理，柔和光影层次\n3.星光狐狸LOGO，搭配文字「STAR FOX」，暗夜藏蓝底色，细碎星光装饰，高级精致\n4.山茶小兔LOGO，搭配文字「FLOWER BUN」，淡粉柔色底色，花瓣纹理环绕，温柔治愈\n5.机车黑豹LOGO，搭配文字「BLACK SPEED」，哑光深灰底色，机械线条细节，酷感极简\n6.海盐海豚LOGO，搭配文字「SEA DOLPHIN」，清透青蓝底色，水波纹路，简约流畅\n7.烘焙小猫LOGO，搭配文字「SWEET BAKE」，焦糖浅棕底色，甜点细碎装饰，细腻质感\n8.森林小鹿LOGO，搭配文字「DEER WOOD」，墨绿色底色，叶脉纹理点缀，自然高级\n9.霓虹猫头鹰LOGO，搭配文字「NIGHT OWL」，酒红哑光底色，几何边框，潮流设计。',
    image: '/ai-templates/tpl-logo-grid.webp',
    aspectRatio: '3:4',
  },
  {
    id: 'paper-hole',
    name: '撕纸破洞·盲盒',
    prompt: '纯白色纸张破洞视角，洞边缘有撕纸毛绒状白边，洞后是浅蓝色头发 Q 版盲盒公仔，公仔戴透明粉色圆框眼镜（头顶架同款小眼镜），蓝发别小纽扣，穿蓝黄裙配白色毛绒围脖，皮肤粉嫩，眼睛通透带星光，潮玩手办摄影风格，干净整洁，构图简单。',
    image: '/ai-templates/tpl-paper-hole.webp',
    aspectRatio: '1:1',
  },
  {
    id: 'island-blindbox',
    name: '3D盲盒·海岛度假',
    prompt: '3D盲盒手办渲染，高光通透质感，精致建模，色彩鲜亮干净。\n迷你海岛小岛场景，白沙滩、蔚蓝海水、椰子树、小木屋、游泳圈、遮阳伞，Q版小人悠闲度假，构图饱满，层次立体，潮玩高级感。',
    image: '/ai-templates/tpl-island-blindbox.webp',
    aspectRatio: '3:4',
  },
  {
    id: 'digital-muse',
    name: '未来感3D头像',
    prompt: '纯白极简背景的未来感3D头像海报，顶部以小型浅粉雾紫无衬线字写"DIGITAL MUSE"，字距宽、背光略低，作为背景标题横向铺开，画面中心为半身潮流女孩形象，深棕高丸子造型，佩戴镜面银色猫耳头饰、科技感耳饰和珠光配件，周边多个3D拟物标签元素，如软绒字母云、圆润服饰、亚克力小徽章与半透明社交气泡，采用了结局银白、奶咖、樱粉、雾蓝和浅灰，人物服装与配件未来标记Y2K风、精致商业修图随后和柔焦棚拍摄，整体构图居中简洁，兼头像设计、潮流社媒封面和3D虚拟时尚视觉效果。',
    image: '/ai-templates/tpl-digital-muse.webp',
    aspectRatio: '9:16',
  },
  {
    id: 'soft-household',
    name: '3D软胶生活用品',
    prompt: '3D 软胶质感拟人生活用品集合，浅灰色哑光背景，六件 Q 萌大眼单品分两列排版：雾霾蓝色手提包、橙色花朵造型抽纸盒、薄荷绿复古台式电脑、天蓝色小台灯、橙黄色猫爬架、浅蓝色条纹小桌子，每款都带着圆溜溜黑色大眼睛，果冻质感软萌可爱，治愈系 3D 风格，竖版构图。',
    image: '/ai-templates/tpl-soft-household.webp',
    aspectRatio: '3:4',
  },
  {
    id: 'retro-music',
    name: '复古音乐3D贴纸',
    prompt: '浅灰背景上的复古音乐创作3D贴纸拼贴海报，所有元素都像真正的贴纸一样独立平铺，带少许投影与白色切边，整体集中经典黑、酒红、奶白、银灰和少量樱桃红，内容由 8号台球、镜面迪斯科球、黑胶唱片、汽水罐、黑色头戴耳机、红心图案、星形徽章、电影场记板、经典帆布高帮鞋、红色电吉他、双人子、棒棒糖和复古卡通头像组成，中央用黑体呼应"I LOVE SOUND"，字形粗重简洁，整体樱桃风格带有欧美复古流行文化、摇滚乐、街头派对和千禧年青春文艺，适合音乐海报、手拼贴、周边设计和社媒封面视觉。',
    image: '/ai-templates/tpl-retro-music.webp',
    aspectRatio: '9:16',
  },
  {
    id: 'pet-fashion',
    name: '萌宠时尚写真',
    prompt: '高颜值萌宠时尚写真，暖黄色纯色背景前，一只奶白色长毛直立出镜，头戴浅珊瑚粉丝巾帽，佩戴圆框糖果色墨镜，丝巾在胸前垂落形成松果蝴蝶结造型，头发蓬柔柔和，光线明亮明显，以奶白、柠檬黄、珊瑚粉、橙黄为主，构图居中，背景简洁，带轻微摄影棚阴影，时尚、俏皮、可爱，兼具杂志封面与社交媒体头像风格，超清亮点，锐利细节。',
    image: '/ai-templates/tpl-pet-fashion.webp',
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
    id: 'oil-bluecat',
    name: '厚涂油画·蓝猫',
    prompt: '厚涂油画风格，英短蓝猫脸部特写，蓝灰色猫毛纹理根根分明，琥珀色圆形大眼睛里装着整片蓝色海底世界，彩色热带鱼群在海草与珊瑚间游动，背景为纯黑色，细节生动梦幻，油画笔触清晰，竖版构图。',
    image: '/ai-templates/tpl-oil-bluecat.webp',
    aspectRatio: '3:4',
  },
  {
    id: 'engrave-courtyard',
    name: '凹版版画·中式庭院',
    prompt: '采用经典凹版版画艺术风格，主体为雅致的中式庭院景致，画面核心是古朴的木质亭阁与飞檐翘角，周围环绕着蜿蜒流水、叠石假山与盛放的牡丹花枝。整体运用暖橙、藏青与纯白三色搭配，前景以舒展的兰草与湖面浮萍点缀，中景细致描绘回廊窗棂与庭院草木，背景衬以轻柔流云。外轮廓使用0.8mm扎实线条，内部纹理以0.1mm精细线条刻画，保留铜版雕刻的颗粒质感与复古线条肌理，画面层次丰富细腻，国风氛围感强烈，高清精致。',
    image: '/ai-templates/tpl-engrave-courtyard.webp',
    aspectRatio: '3:4',
  },
  {
    id: 'minimal-city',
    name: '长场雄·极简城市',
    prompt: '长场雄日系极简扁平风，利落细线条，几何精致构图，城市极简建筑群场景，楼宇轮廓、天桥、行人剪影、落日余晖，低饱和冷调高级配色，线条规整精致，元素丰富但极简克制，文艺高级感。',
    image: '/ai-templates/tpl-minimal-city.webp',
    aspectRatio: '3:4',
  },
  {
    id: 'geometric-coast',
    name: '几何海边城市',
    prompt: '几何艺术扁平风，块面拼接构图，低饱和灰粉橘配色，线条极简高级。\n海边城市海岸线，几何楼宇、沙滩海浪、落日渐变天空、飞鸟剪影，构图精致大气，元素丰富克制，文艺高级氛围感。',
    image: '/ai-templates/tpl-geometric-coast.webp',
    aspectRatio: '3:4',
  },
  {
    id: 'retro-cafe',
    name: '复古咖啡馆画报',
    prompt: '复古摩登画报插画，哑光质感，复古柔棕米黄配色，线条优雅复古。\n老式复古咖啡馆内景，复古沙发、落地灯、咖啡机、绿植盆栽、看书的优雅人物，窗光影错落，细节精致，年代感十足。',
    image: '/ai-templates/tpl-retro-cafe.webp',
    aspectRatio: '3:4',
  },
  {
    id: 'chinese-plant',
    name: '国潮奇幻植物',
    prompt: '新中式国潮风奇幻植物插画海报，竖版构图，高饱和撞色+细腻线条，治愈奇幻。\n巨型银杏叶、银杏果做主体，小人物+小鹿点缀角落，左上角英文标题「GOOD THING 」。\n克莱因蓝+暖橙+米白撞色，细腻线条纹理，秋日治愈场景，适配秋日IP/绘本宣传。',
    image: '/ai-templates/tpl-chinese-plant.webp',
    aspectRatio: '3:4',
  },
  {
    id: 'seaside-poster',
    name: '拼贴风海边画报',
    prompt: '拼贴风海边画报，竖版构图。\n\n• 背景：外框是淡蓝色，中间是撕边的浅蓝水彩晕染底色，带颗粒质感。\n\n• 文字：多条蓝色手写英文斜向排列，搭配黑色手写中文「奔赴海边，和夏天撞个满怀」，下方小字「海浪、沙滩、落日，所有烦恼都被海风带走」。\n\n• 装饰元素：海浪线条、贝壳贴纸、椰子树剪影，右下角是一只躺在沙滩上的遮阳伞剪影。\n\n• 底部标签：「海边度假画报」「100次·说走就走·旅行」，整体清爽治愈，充满夏日松弛感。',
    image: '/ai-templates/tpl-seaside-poster.webp',
    aspectRatio: '3:4',
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
    id: 'retro-film-summer',
    name: '复古胶片·夏日晚风',
    prompt: '复古胶片感海报，浅蓝调做旧纸，挂在夏日树枝上，背景是阳光树叶与草地光斑。\n\n• 文字内容：\n\n◦ 手写体主文案：「我整天追着风跑，直到夏天退烧。」\n\n◦ 英文点缀：MANY WINDS BLOW / I LOVE SUMMER.\n\n◦ 署名：「佚名」《夏日晚风》\n\n◦ 顶部版权：©SUMMER。',
    image: '/ai-templates/tpl-retro-film-summer.webp',
    aspectRatio: '3:4',
  },
  {
    id: 'study-emotion',
    name: '学生党情绪海报',
    prompt: '搞怪手写风学生情绪海报，竖版构图，软萌云朵异形边框，奶黄+暖黄+深棕撞色。\n超大主标题大字错落堆叠：「作业是堆成山的 笔是拿不动一下的」，黄色高亮标签「学生党！！！」。\n角落搞怪小元素：摆烂表情、扔笔手势，侧边拼音「XUE SHENG DANG!!! / ZUO YE DUI CHENG SHAN DE」，网感拉满，适配学生党吐槽海报。',
    image: '/ai-templates/tpl-study-emotion.webp',
    aspectRatio: '3:4',
  },
  {
    id: 'wood-coffee',
    name: '木质拼贴·手作咖啡',
    prompt: '木质拼贴扁平字海报，深咖色背景，用原木木纹木片+奶白/焦糖/墨绿咖啡色系块，拼出立体大字「手作咖啡」，融入咖啡豆、咖啡杯、拉花等咖啡元素造型，真实木纹肌理，手工感，温暖治愈，底部标注小字「4 月 咖啡季」，咖啡元素点缀。',
    image: '/ai-templates/tpl-wood-coffee.webp',
    aspectRatio: '3:4',
  },
  {
    id: 'pet-market',
    name: '宠物市集·鱼眼海报',
    prompt: '竖版宠物市集主题宣传海报，鱼眼镜头实拍风格，活力动感，适配市集活动、宠物宣传。\n\n【背景与主体】\n1.  主背景：宠物市集草坪实拍图，鱼眼广角镜头拍摄，画面边缘做黑边喷绘肌理，强化动感；\n2.  视觉核心：画面中心一只布偶猫，表情生动，互动感强；\n3.  底部背景：橙色渐变背景，做视觉分割，突出主标题。\n\n【文字排版】\n1.  顶部品牌区：橙色圆角栏，内放「布丁宠物市集」品牌LOGO；\n2.  右上角标语区：绿色手写涂鸦字「萌宠集结 快乐赶集」；\n3.  底部主标题区：超大号白色毛笔书法字「毛孩子的狂欢」，搭配黄色涂鸦线条装饰。\n【整体风格要求】\n鱼眼镜头实拍，真实生动，橙色+鲜绿撞色，活力动感，主体突出，文字层级清晰，治愈可爱，适配宠物市集活动宣传。',
    image: '/ai-templates/tpl-pet-market.webp',
    aspectRatio: '1:1',
  },
  {
    id: 'spring-drink',
    name: '春日·气泡饮',
    prompt: '春日清新弥散风饮品海报，竖版构图，主体草莓气泡水居中，柔焦虚化通透质感。\n多层文字错落排版：顶部明黄大字「SPRING」，搭配粉色主标题「&春天你好」，副标题「（春日甜蜜 正在派送）」。\n画面点缀草莓、薄荷叶、星光，粉色标签「春天的味道」，蓝色标签「HELLO」，底部「HELLO SPRING <开启春日美好>」，粉白+明黄撞色，条纹背景，清新治愈，适配春日宣传。',
    image: '/ai-templates/tpl-spring-drink.webp',
    aspectRatio: '3:4',
  },
  {
    id: 'fresh-film',
    name: '竖版胶片·城市出逃',
    prompt: '竖版清新胶片风海报，蓝调质感，松弛感拉满。\n\n• 背景：夏日傍晚的橘粉渐变天空，带着细碎的光斑，像相机拍出的漏光效果。\n\n• 主体：画面右侧是几枝被风吹歪的狗尾巴草，前景虚化，带着胶片颗粒感。\n\n• 文字信息：\n◦ 中间手写体主标题：「城市出逃计划」，英文 Summer Escape\n\n◦ 括号小字：Hello Summer，英文 The wind blows where it will\n\n◦ 底部两条弧形标签：「风里藏着自由」「逃离格子间的夏天」\n整体氛围：清爽自由，把日常出逃的松弛感拉满，和原图的春日感完全不同。',
    image: '/ai-templates/tpl-fresh-film.webp',
    aspectRatio: '3:4',
  },
  {
    id: 'travel-collage',
    name: '拼贴旅行·去看海吧',
    prompt: '拼贴风旅行海报，清新蓝白配色，手绘涂鸦+实景拼贴。\n\n• 拼贴元素：海边斑马线、沙滩路牌、海浪特写、椰子树剪影。\n\n• 文字排版：\n\n◦ 主标题（手写体）：去看海吧\n\n◦ 英文点缀：Go to the sea\n\n◦ 路牌文案：一直向往，奔赴在海边的路上\n\n◦ 小字文案：\n累的话就去看海吧！吹吹海风，听听浪声，和夏天撞个满怀。\n\n• 氛围：清新治愈，充满海边旅行的松弛感。',
    image: '/ai-templates/tpl-travel-collage.webp',
    aspectRatio: '3:4',
  },
  {
    id: 'pixel-city',
    name: '像素风·城市漫游',
    prompt: '像素风标题字效，高饱和橙黑配色，街头感拉满。\n\n• 主标题：城市漫游（像素块描边，橙黄底色+黑色粗体字，边缘做毛边像素颗粒效果）\n\n• 英文副标：CITY WANDER\n\n• 贴纸元素：左上角黄底贴纸写着「2026 STREET」，右下角贴纸写着「出逃计划」，搭配小相机涂鸦。\n\n• 整体氛围：街头潮酷感，充满城市探索的活力。',
    image: '/ai-templates/tpl-pixel-city.webp',
    aspectRatio: '3:4',
  },
]
