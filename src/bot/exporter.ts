import { GIFEncoder, quantize, applyPalette } from 'gifenc'
import { DEMI_VIEWBOX } from './repere'

/**
 * Export du bot en PNG, SVG, SVG anime et GIF, plus la copie dans le presse-papiers.
 *
 * Le moteur est une fonction pure du temps : pour capturer un cycle, on pilote une
 * instance hors ecran de `BloubBot` avec `rendAt(t)` et on lit son `<svg>` a chaque
 * date. Tout ce module ne fait que transformer ces arbres en fichiers — aucune
 * horloge, aucun Vue. Le routage de la date, lui, reste dans la vue.
 */

export const EXPORT_SIZE = 1024
export const GIF_SIZE = 480
export const FPS = 20
/** Plafond d'images a exporter : au-dela le fichier devient illisible. */
export const MAX_FRAMES = 120

/**
 * Nombre d'images pour un cycle de `total` secondes. Echantillonne au pas de
 * `FPS`, plafonne a `MAX_FRAMES`. Sous 2 images (cycle quasi nul) on retombe sur 2.
 */
export function frameCount(total: number): number {
  return Math.min(MAX_FRAMES, Math.max(2, Math.round(total * FPS)))
}

export function frameStep(total: number): number {
  return total / frameCount(total)
}

/* --------------------------------------------------------------- chaines SVG */

/**
 * `<svg>` autonome a partir de l'arbre d'une frame : xmlns requis pour etre
 * charge comme image (rasterisation PNG/GIF), taille figee au rendu.
 */
export function frameMarkup(el: SVGSVGElement, size = EXPORT_SIZE): string {
  const clone = el.cloneNode(true) as SVGSVGElement
  clone.removeAttribute('class')
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('width', String(size))
  clone.setAttribute('height', String(size))
  return stripComments(new XMLSerializer().serializeToString(clone))
}

/**
 * Contenu interieur d'une frame (defs + corps, sans la balise `<svg>`), avec
 * chaque `id` et `url(#...)` suffixe : les defs d'une frame different d'une
 * autre (les trous d'yeux bougent), donc les empiler dans le meme document sans
 * distinguer leurs ids ferait pointer toutes les references vers le premier masque.
 */
export function frameInnerMarkup(el: SVGSVGElement, suffix: string): string {
  const clone = el.cloneNode(true) as SVGSVGElement
  clone.removeAttribute('class')
  const body = Array.from(clone.childNodes)
    .map((n) => new XMLSerializer().serializeToString(n))
    .join('')
    .replace(/\bid="([^"]+)"/g, (_m, id: string) => `id="${id}${suffix}"`)
    .replace(/url\(\s*#([^)]+)\s*\)/g, (_m, id: string) => `url(#${id}${suffix})`)
  return stripComments(body)
}

/** Retire les notes de conception que le composant laisse dans le XML livre. */
function stripComments(xml: string): string {
  return xml.replace(/<!--[\s\S]*?-->/g, '')
}

/**
 * SVG anime : chaque frame est un `<g>` empile, revele par une animation CSS en
 * pas. C'est une « pellicule » — toutes les images sont la, l'animation ne fait
 * que choisir laquelle est visible a chaque instant, a la vitesse reelle.
 */
export function filmStrip(inners: string[], total: number, size = EXPORT_SIZE): string {
  const n = Math.max(1, inners.length)
  const VB = DEMI_VIEWBOX
  const span = fmt(100 / n)
  const keyframes = `@keyframes bloub-strip{0%{opacity:1}${span}%{opacity:1}${span}%{opacity:0}100%{opacity:0}}`
  const delays = inners
    .map((_, i) => `.bloub-frame-${i}{animation-delay:-${fmt((i * total) / n)}s}`)
    .join('')
  const style = `.bloub-frame{opacity:0;animation:bloub-strip ${fmt(total)}s linear infinite}${delays}`
  const body = inners
    .map((inner, i) => `<g class="bloub-frame bloub-frame-${i}">${inner}</g>`)
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${-VB} ${-VB} ${VB * 2} ${VB * 2}"><style>${keyframes}${style}</style>${body}</svg>`
}

/** Nombre sans -0 et sans trainee de flottants, pour les delais CSS. */
function fmt(v: number): string {
  return (Math.round(v * 1000) / 1000).toString()
}

/* ------------------------------------------------------- rasterisation PNG */

async function svgToCanvas(markup: string, size: number): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }))
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas 2d non disponible')
    ctx.clearRect(0, 0, size, size)
    ctx.drawImage(img, 0, 0, size, size)
    return canvas
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function pngFromMarkup(markup: string, size = EXPORT_SIZE): Promise<Blob> {
  const canvas = await svgToCanvas(markup, size)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('rasterisation PNG echouee')
  return blob
}

/* ------------------------------------------------------------- GIF anime */

/**
 * Encode un GIF anime a partir des `<svg>` de chaque frame. Chaque frame a sa
 * palette locale (les anneaux changent de teinte), quantifiee sur 256 couleurs.
 */
export async function gifFromMarkups(markups: string[], size = GIF_SIZE): Promise<Blob> {
  const gif = GIFEncoder()
  const delay = Math.round(1000 / FPS)
  for (const markup of markups) {
    const canvas = await svgToCanvas(markup, size)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas 2d non disponible')
    const { data } = ctx.getImageData(0, 0, size, size)
    const palette = quantize(data, 256)
    const index = applyPalette(data, palette)
    gif.writeFrame(index, size, size, { palette, delay })
  }
  gif.finish()
  // copie dans un Uint8Array<ArrayBuffer> : `gif.bytes()` est typé
  // `Uint8Array<ArrayBufferLike>`, rejeté comme BlobPart par les tsconfig stricts
  return new Blob([new Uint8Array(gif.bytes())], { type: 'image/gif' })
}

/* ---------------------------------------------------------- presse-papiers */

export async function copyPng(markup: string, size = EXPORT_SIZE): Promise<void> {
  const ClipboardItemCtor = (window as unknown as { ClipboardItem?: typeof ClipboardItem })
    .ClipboardItem
  if (!navigator.clipboard || !ClipboardItemCtor) {
    throw new Error('copie d’image non supportee par ce navigateur')
  }
  const blob = await pngFromMarkup(markup, size)
  await navigator.clipboard.write([new ClipboardItemCtor({ 'image/png': blob })])
}

export async function copySvg(markup: string): Promise<void> {
  await navigator.clipboard.writeText(markup)
}
