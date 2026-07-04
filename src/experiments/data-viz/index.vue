<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import * as d3 from 'd3'
import { tracks } from '@/data/tracks'
import { rocoTracks } from '@/data/roco-tracks'

interface ArtistNode extends d3.SimulationNodeDatum {
  artist: string
  count: number
  liked: number
  roco: number
  r: number
}

const W = 960
const H = 560

const svgEl = ref<SVGSVGElement | null>(null)
const tooltip = ref<{ artist: string; count: number; liked: number; roco: number; x: number; y: number } | null>(null)
let simulation: d3.Simulation<ArtistNode, undefined> | null = null

const stats = computed(() => {
  const artists = new Set<string>()
  for (const t of tracks) artists.add(t.artist)
  for (const t of rocoTracks) artists.add(t.artist)
  return { total: tracks.length + rocoTracks.length, artists: artists.size, liked: tracks.length, roco: rocoTracks.length }
})

onMounted(() => {
  const map = new Map<string, { liked: number; roco: number }>()
  for (const t of tracks) {
    const e = map.get(t.artist) ?? { liked: 0, roco: 0 }
    e.liked++
    map.set(t.artist, e)
  }
  for (const t of rocoTracks) {
    const e = map.get(t.artist) ?? { liked: 0, roco: 0 }
    e.roco++
    map.set(t.artist, e)
  }
  const data: ArtistNode[] = Array.from(map.entries())
    .map(([artist, v]) => ({ artist, count: v.liked + v.roco, liked: v.liked, roco: v.roco, r: 12 }))
    .sort((a, b) => b.count - a.count)

  const maxCount = data[0]?.count ?? 1
  const rScale = d3.scaleSqrt().domain([1, maxCount]).range([10, 38])
  data.forEach((d) => {
    d.r = rScale(d.count)
  })

  const svg = d3.select(svgEl.value!)
  svg.selectAll('*').remove()
  const g = svg.append('g')

  const node = g
    .selectAll<SVGGElement, ArtistNode>('g.node')
    .data(data)
    .join('g')
    .attr('class', 'node')
    .style('cursor', 'pointer')

  node
    .append('circle')
    .attr('r', (d) => d.r)
    .attr('class', (d) => {
      if (d.liked > 0 && d.roco > 0) return 'node__circle node__circle--both'
      return d.roco > 0 ? 'node__circle node__circle--roco' : 'node__circle'
    })

  node
    .append('text')
    .attr('class', 'node__label')
    .attr('text-anchor', 'middle')
    .attr('dy', '0.32em')
    .text((d) => (d.r > 16 ? (d.artist.split(/[ /]/)[0] ?? '') : ''))

  node
    .on('mouseenter', (event, d) => {
      const rect = svgEl.value!.getBoundingClientRect()
      tooltip.value = {
        artist: d.artist,
        count: d.count,
        liked: d.liked,
        roco: d.roco,
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      }
    })
    .on('mousemove', (event, d) => {
      const rect = svgEl.value!.getBoundingClientRect()
      tooltip.value = {
        artist: d.artist,
        count: d.count,
        liked: d.liked,
        roco: d.roco,
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      }
    })
    .on('mouseleave', () => {
      tooltip.value = null
    })

  simulation = d3
    .forceSimulation(data)
    .force('charge', d3.forceManyBody().strength(-55))
    .force('center', d3.forceCenter(W / 2, H / 2))
    .force('collide', d3.forceCollide<ArtistNode>().radius((d) => d.r + 3).strength(0.9))
    .on('tick', () => {
      node.attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`)
    })
})

onUnmounted(() => simulation?.stop())
</script>

<template>
  <div class="viz">
    <div class="viz__stats">
      <span><strong>{{ stats.total }}</strong> 首</span>
      <span class="viz__dot viz__dot--liked"></span>
      <span>{{ stats.liked }} liked</span>
      <span class="viz__dot viz__dot--roco"></span>
      <span>{{ stats.roco }} roco</span>
      <span class="viz__stat-muted">{{ stats.artists }} 位 artist</span>
    </div>

    <div class="viz__canvas">
      <svg
        ref="svgEl"
        :viewBox="`0 0 ${W} ${H}`"
        preserveAspectRatio="xMidYMid meet"
        class="viz__svg"
      ></svg>
      <div
        v-if="tooltip"
        class="viz__tip"
        :style="{ left: tooltip.x + 'px', top: tooltip.y + 'px' }"
      >
        <div class="viz__tip-artist">{{ tooltip.artist }}</div>
        <div class="viz__tip-meta">
          {{ tooltip.count }} 首 · {{ tooltip.liked }} liked · {{ tooltip.roco }} roco
        </div>
      </div>
    </div>

    <p class="viz__hint">圆大小 = 歌曲数 · 颜色 = 合集来源 · hover 查看</p>
  </div>
</template>

<style scoped lang="scss">
.viz {
  --viz-roco: #e8854b;
}

.viz__stats {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  font-family: var(--font-mono);
  font-size: 0.82rem;
  color: var(--color-text-muted);
  margin-bottom: var(--space-4);
  flex-wrap: wrap;
}

.viz__stats strong {
  color: var(--color-text);
  font-weight: 600;
}

.viz__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}

.viz__dot--liked {
  background: var(--color-accent);
}

.viz__dot--roco {
  background: var(--viz-roco);
}

.viz__stat-muted {
  margin-left: auto;
}

.viz__canvas {
  position: relative;
  width: 100%;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  overflow: hidden;
}

.viz__svg {
  width: 100%;
  height: 560px;
  display: block;
}

:deep(.node__circle) {
  fill: var(--color-accent);
  fill-opacity: 0.65;
  stroke: var(--color-accent-strong);
  stroke-width: 1.5;
  transition: fill-opacity 0.2s;
}

:deep(.node__circle--roco) {
  fill: var(--viz-roco);
  fill-opacity: 0.65;
  stroke: #b5622e;
}

:deep(.node__circle--both) {
  fill: var(--color-accent);
  fill-opacity: 0.7;
  stroke: var(--viz-roco);
  stroke-width: 2.5;
}

:deep(.node:hover .node__circle) {
  fill-opacity: 0.9;
}

:deep(.node__label) {
  font-family: var(--font-mono);
  font-size: 9px;
  fill: var(--color-text);
  pointer-events: none;
  user-select: none;
}

.viz__tip {
  position: absolute;
  pointer-events: none;
  transform: translate(12px, 12px);
  background: var(--color-bg);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  padding: 0.5rem 0.7rem;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  white-space: nowrap;
  z-index: 5;
}

.viz__tip-artist {
  font-weight: 600;
  font-size: 0.85rem;
  margin-bottom: 0.15rem;
}

.viz__tip-meta {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: var(--color-text-muted);
}

.viz__hint {
  margin-top: var(--space-3);
  font-size: 0.82rem;
  color: var(--color-text-muted);
  font-family: var(--font-mono);
}
</style>
