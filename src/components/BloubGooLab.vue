<script setup lang="ts">
import { ref } from 'vue'
import BloubBot from '@/components/BloubBot.vue'
import type { Block } from '@/bot/cycles'
import type { ExpressionId } from '@/bot/expressions'
import { GOO_EYES, type GooSkin } from '@/bot/goo'

/**
 * Le labo de design de la peau Goo, v2 : trois AXES de caractere, dans l'ordre
 * ou ils comptent — la silhouette (c'est elle qui fait la premiere impression),
 * l'oeil en couleur (plus jamais le trou blanc), l'expression et le mouvement.
 * Chaque carte est rendue VIVANTE par le vrai moteur. Monte par `/bloub?goo`.
 */

/** Chaque bot du labo respire en idle, seul : pas de montage, pas de suivi. */
const IDLE: Block[] = [{ state: 'idle', duration: 6 }]
/** La carte de mouvement : une boucle de quatre etats, la signature du moteur. */
const DEMO: Block[] = [
  { state: 'idle', duration: 2.2 },
  { state: 'thinking', duration: 2.6 },
  { state: 'wink', duration: 1.6 },
  { state: 'wide', duration: 1.8 }
]

interface Variant {
  id: string
  label: string
  params: string
  goo?: GooSkin
  shape?: string
  expression?: ExpressionId
  /** vignette figee (les tuiles d'expression) */
  frozen?: boolean
  cycle?: Block[]
}

/* Yeux en couleur : les teintes partagees avec le personnalisateur. */
const AMBER = GOO_EYES.ambre
const MINT = GOO_EYES.menthe
const CORAL = GOO_EYES.corail
const BLUEVIOLET = GOO_EYES.violet
const NUIT = GOO_EYES.nuit

const ROWS: { title: string; hint: string; variants: Variant[] }[] = [
  {
    title: '一 · 形状',
    hint: '轮廓是性格的第一眼——引擎支持任意径向轮廓，切换时平滑渐变。布丁已晋升为自定义形状。',
    variants: [
      { id: 'A', label: 'A · 球', params: '现状 · 基准', shape: 'cercle' },
      { id: 'B', label: 'B · 鹅卵石', params: '随性 · 不规则', shape: 'galet' },
      { id: 'C', label: 'C · 水滴', params: '坐着的 Goo', shape: 'goutte' },
      { id: 'D', label: 'D · 饭团', params: '圆三角 · 憨', shape: 'triangle' },
      { id: 'E', label: 'E · 胶囊', params: '横躺 · 慵懒', shape: 'capsule' },
      { id: 'F', label: 'F · 布丁', params: '上窄下宽 · 会抖', shape: 'pudding' },
      { id: 'H', label: 'H · 云朵', params: '软 · 多丘', shape: 'nuage' }
    ]
  },
  {
    title: '二 · 全色眼睛',
    hint: '整只眼睛上色 + 双高光，不再是白洞黑瞳。高光和瞳心随眨眼一起被压扁。',
    variants: [
      { id: 'A', label: 'A · 琥珀 · 原眼形', params: '竖胶囊上色', goo: { eye: AMBER } },
      { id: 'B', label: 'B · 琥珀 · 圆眼', params: 'Ø0.46', goo: { round: 0.46, eye: AMBER } },
      { id: 'C', label: 'C · 薄荷 · 圆眼', params: '终端绿 · 极客', goo: { round: 0.46, eye: MINT } },
      { id: 'E', label: 'E · 珊瑚 · 圆眼', params: '暖 · 热情', goo: { round: 0.46, eye: CORAL } },
      { id: 'F', label: 'F · 蓝紫 · 圆眼', params: '冷 · 理性', goo: { round: 0.46, eye: BLUEVIOLET } },
      {
        id: 'G',
        label: 'G · 琥珀 + 深芯',
        params: '圆眼 · 有瞳心',
        goo: { round: 0.46, eye: { ...AMBER, core: '#6e4a02' } }
      },
      { id: 'H', label: 'H · 琥珀 · 大圆眼', params: 'Ø0.52 · 占满脸', goo: { round: 0.52, eye: AMBER } },
      { id: 'I', label: 'I · 墨黑 · 圆眼', params: '深黑纯色 · 不渐变', goo: { round: 0.46, eye: NUIT } }
    ]
  },
  {
    title: '三 · 表情与动效',
    hint: '上色后几何不变——16 种表情全数可用，这是其中 8 个。最后一张是活的状态循环。',
    variants: [
      { id: 'excite', label: '兴奋', params: 'excite', expression: 'excite', frozen: true, goo: { eye: AMBER } },
      { id: 'heureux', label: '开心', params: 'heureux', expression: 'heureux', frozen: true, goo: { eye: AMBER } },
      { id: 'hilare', label: '大笑', params: 'hilare', expression: 'hilare', frozen: true, goo: { eye: AMBER } },
      { id: 'colere', label: '生气', params: 'colere', expression: 'colere', frozen: true, goo: { eye: AMBER } },
      { id: 'triste', label: '委屈', params: 'triste', expression: 'triste', frozen: true, goo: { eye: AMBER } },
      { id: 'confus', label: '困惑', params: 'confus', expression: 'confus', frozen: true, goo: { eye: AMBER } },
      { id: 'curieux', label: '好奇', params: 'curieux', expression: 'curieux', frozen: true, goo: { eye: AMBER } },
      { id: 'somnolent', label: '困', params: 'somnolent', expression: 'somnolent', frozen: true, goo: { eye: AMBER } },
      {
        id: 'demo',
        label: '状态循环 · 活的',
        params: '待机→思考→眨眼→瞪圆',
        cycle: DEMO,
        goo: { eye: AMBER }
      }
    ]
  }
]

/** 勾选备用：看中哪张，报字母（或表情名）即可。 */
const picked = ref<string | null>(null)

function close() {
  window.location.replace('/bloub')
}
</script>

<template>
  <div class="goolab" role="dialog" aria-label="Goo 设计实验室">
    <header class="goolab__head">
      <div>
        <h1 class="goolab__title">Goo · 小咕 — 设计实验室 v2</h1>
        <p class="goolab__sub">
          三个轴：形状 → 全色眼睛 → 表情动效，全部由真引擎实时渲染。看完报组合给我（如「D + B」）。
        </p>
      </div>
      <button class="goolab__close" type="button" @click="close">返回工作台</button>
    </header>

    <section v-for="row in ROWS" :key="row.title" class="goolab__row">
      <h2 class="goolab__rowtitle">{{ row.title }}</h2>
      <p class="goolab__rowhint">{{ row.hint }}</p>
      <div class="goolab__grid">
        <button
          v-for="v in row.variants"
          :key="v.id"
          type="button"
          class="goolab__card"
          :class="{ 'goolab__card--on': picked === v.id }"
          @click="picked = picked === v.id ? null : v.id"
        >
          <BloubBot
            :size="200"
            :cycle="v.cycle ?? IDLE"
            :playing="!v.frozen"
            :frozen-at="v.frozen ? 1 : undefined"
            :flat="v.frozen"
            :expression="v.expression ?? 'neutre'"
            :shape="v.shape ?? 'cercle'"
            :goo="v.goo ?? null"
          />
          <span class="goolab__label">{{ v.label }}</span>
          <span class="goolab__params">{{ v.params }}</span>
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped lang="scss">
.goolab {
  position: fixed;
  inset: 0;
  z-index: 60;
  overflow-y: auto;
  background: #f9f9f9;
  padding: 40px clamp(20px, 5vw, 72px) 72px;
}

.goolab__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  max-width: 1180px;
  margin: 0 auto 36px;
}

.goolab__title {
  margin: 0;
  font-size: 22px;
  font-weight: 650;
  letter-spacing: -0.01em;
}

.goolab__sub {
  margin: 6px 0 0;
  font-size: 13px;
  color: #8a8a8a;
}

.goolab__close {
  border: 1px solid #d9d9d9;
  background: #fff;
  color: #0a0a0c;
  border-radius: 999px;
  padding: 8px 16px;
  font-size: 13px;
  cursor: pointer;

  &:hover {
    border-color: #0a0a0c;
  }
}

.goolab__row {
  max-width: 1180px;
  margin: 0 auto 40px;
}

.goolab__rowtitle {
  margin: 0;
  font-size: 15px;
  font-weight: 650;
}

.goolab__rowhint {
  margin: 4px 0 16px;
  font-size: 12.5px;
  color: #8a8a8a;
}

.goolab__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  gap: 14px;
}

.goolab__card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 18px 12px 16px;
  background: #fff;
  border: 1.5px solid #ececec;
  border-radius: 18px;
  cursor: pointer;
  text-align: center;
  transition:
    border-color 0.2s ease,
    transform 0.2s ease;

  &:hover {
    border-color: #b9b9b9;
    transform: translateY(-2px);
  }

  &--on {
    border-color: #0a0a0c;
    box-shadow: 0 0 0 1px #0a0a0c inset;
  }
}

.goolab__label {
  margin-top: 8px;
  font-size: 13.5px;
  font-weight: 600;
  color: #0a0a0c;
}

.goolab__params {
  font-size: 12px;
  color: #8a8a8a;
}
</style>
