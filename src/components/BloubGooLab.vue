<script setup lang="ts">
import { ref } from 'vue'
import BloubBot from '@/components/BloubBot.vue'
import type { Block } from '@/bot/cycles'
import type { GooSkin } from '@/bot/goo'

/**
 * Le labo de design de la peau Goo : chaque variante rendue VIVANTE par le vrai
 * moteur, cote a cote, pour choisir en regardant — pas en imaginant. Monte par
 * `/bloub?goo`, il ne touche a rien d'autre : la page normale reste en dessous.
 */

/** Chaque bot du labo respire en idle, seul : pas de montage, pas de suivi. */
const IDLE: Block[] = [{ state: 'idle', duration: 6 }]

interface Variant {
  id: string
  label: string
  params: string
  goo: GooSkin
}

const ROWS: { title: string; hint: string; variants: Variant[] }[] = [
  {
    title: '一 · 眼睛形状',
    hint: '竖胶囊是 bloub 的原样；圆眼是 ESFJ 的亲和。直径以球半径为单位。',
    variants: [
      { id: 'A', label: 'A · 现状胶囊眼', params: 'bloub 原样', goo: {} },
      { id: 'B', label: 'B · 圆眼 Ø0.30', params: '小巧 · 精灵感', goo: { round: 0.3 } },
      { id: 'C', label: 'C · 圆眼 Ø0.36', params: '居中 · 推荐', goo: { round: 0.36 } },
      { id: 'D', label: 'D · 圆眼 Ø0.42', params: '舒展 · 占满脸', goo: { round: 0.42 } }
    ]
  },
  {
    title: '二 · 瞳点',
    hint: '瞳点是眼洞里的一粒墨——方形即终端光标，是「极客」的签名。底座 Ø0.38。',
    variants: [
      { id: 'E', label: 'E · 圆眼无瞳', params: 'Ø0.38 · 对照', goo: { round: 0.38 } },
      { id: 'F', label: 'F · 方瞳', params: 'Ø0.38 · 终端光标', goo: { round: 0.38, pupil: 'square' } },
      { id: 'G', label: 'G · 圆瞳', params: 'Ø0.38 · 保守', goo: { round: 0.38, pupil: 'round' } },
      { id: 'H', label: 'H · 大底座方瞳', params: 'Ø0.42 + 方瞳', goo: { round: 0.42, pupil: 'square' } }
    ]
  },
  {
    title: '三 · 天线',
    hint: '直杆是信号接收器；蛇形致辛巳年。发光珠（琥珀）只在「思考」时亮——这里是常亮示意。',
    variants: [
      { id: 'I', label: 'I · 直杆天线', params: 'Ø0.38 + 方瞳', goo: { round: 0.38, pupil: 'square', antenna: 'rod' } },
      { id: 'J', label: 'J · 蛇形天线', params: 'Ø0.38 + 方瞳', goo: { round: 0.38, pupil: 'square', antenna: 'curl' } },
      {
        id: 'K',
        label: 'K · 直杆 + 发光',
        params: '思考态琥珀光',
        goo: { round: 0.38, pupil: 'square', antenna: 'rod', glow: true }
      },
      {
        id: 'L',
        label: 'L · 全家福 + 腮红',
        params: '蛇形 + 光 + 腮红',
        goo: { round: 0.38, pupil: 'square', antenna: 'curl', glow: true, blush: true }
      }
    ]
  }
]

/** 勾选备用：看中哪张，报字母即可。 */
const picked = ref<string | null>(null)

function close() {
  window.location.replace('/bloub')
}
</script>

<template>
  <div class="goolab" role="dialog" aria-label="Goo 设计实验室">
    <header class="goolab__head">
      <div>
        <h1 class="goolab__title">Goo · 小咕 — 设计实验室</h1>
        <p class="goolab__sub">
          全部由真引擎实时渲染（呼吸 · 眨眼 · 跟随同理）。点卡片做标记，报字母给我即可。
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
          <BloubBot :size="200" :cycle="IDLE" :playing="true" :goo="v.goo" />
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
