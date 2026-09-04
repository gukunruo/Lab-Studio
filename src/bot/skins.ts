import { PROFILE_SAMPLES } from './profiles'
import {
  hullOfCircles,
  profileFromPolygon,
  regularPolygonProfile,
  superellipseProfile,
  unionOfCirclesProfile,
  type SkirtWave
} from './shape'
import { GOO_EYES, type GooEye } from './goo'

/**
 * Formes et couleurs proposees par le personnalisateur du bot.
 *
 * A la difference des silhouettes d'animation (`profiles.ts`), celles-ci ne sont
 * PAS relevees sur la video : elles sont construites analytiquement d'apres la
 * grille du personnalisateur d'origine. Deux sources distinctes, donc, et c'est
 * volontaire — les etats animes doivent rester fideles a la video, les formes de
 * base sont un choix d'utilisateur.
 */

/**
 * Les identifiants sont enumeres plutot que deduits du tableau : c'est ce qui
 * permet a la couche i18n de verifier A LA COMPILATION que chaque forme a bien
 * sa traduction dans les trois langues (`t(\`shapes.${id}\`)` ne compile que si
 * la cle existe). Un `as const` sur le tableau aurait le meme effet mais
 * rendrait `radii` en lecture seule, alors que le moteur le passe tel quel.
 */
export type ShapeId =
  | 'cercle'
  | 'galet'
  | 'squircle'
  | 'capsule'
  | 'triangle'
  | 'hexagone'
  | 'nuage'
  | 'goutte'
  | 'pudding'
  | 'gelee'

/** Reflet de matiere : ellipse blanche posee sur le corps (unites de rayon). */
export interface ShapeGloss {
  cx: number
  cy: number
  rx: number
  ry: number
  rot?: number
  opacity: number
}

export interface BotShape {
  id: ShapeId
  radii: number[]
  /** onde de jupe (le gelee) : null par defaut, forme statique */
  skirt?: SkirtWave
  /** reflets de matiere proposes par la forme (le gelee) */
  gloss?: ShapeGloss[]
  /** oeil suggere par la forme : retenu seulement si l'utilisateur n'en a pas choisi un */
  eye?: GooEye
  /** couleur de joues suggeree par la forme (le gelee) */
  blush?: string
}

/** Ramene le rayon maximal a `max` pour que toutes les formes pesent pareil a l'oeil. */
function normalize(radii: number[], max = 1): number[] {
  const peak = Math.max(...radii)
  if (peak <= 0) return radii
  const k = max / peak
  return radii.map((r) => r * k)
}

const ANGLES = Array.from({ length: PROFILE_SAMPLES }, (_, i) => (i / PROFILE_SAMPLES) * Math.PI * 2)

/** Galet : cercle deforme par deux harmoniques basses, donc irregulier mais lisse. */
const pebble = normalize(
  ANGLES.map((a) => 1 + 0.075 * Math.cos(2 * a + 0.5) + 0.035 * Math.cos(3 * a + 2.1)),
  1.02
)

/** Nuage : union de bosses, large en bas, deux lobes en haut. */
const cloud = normalize(
  unionOfCirclesProfile([
    { x: -0.44, y: 0.2, r: 0.54 },
    { x: 0.46, y: 0.2, r: 0.5 },
    { x: 0.02, y: 0.3, r: 0.6 },
    { x: -0.24, y: -0.3, r: 0.48 },
    { x: 0.3, y: -0.24, r: 0.44 }
  ]),
  1.02
)

/** Goutte : gros disque en bas, pointe effilee en haut. */
const droplet = normalize(
  profileFromPolygon(hullOfCircles(0, 0.28, 0.66, 0, -0.96, 0.05), 0, 0),
  1.04
)

/** Capsule couchee : enveloppe de deux disques cote a cote. */
const capsule = profileFromPolygon(hullOfCircles(-0.42, 0, 0.62, 0.42, 0, 0.62), 0, 0)

/** Pudding : gros socle, dome etroit — la goutte assise, venue du labo Goo. */
const pudding = normalize(
  profileFromPolygon(hullOfCircles(0, 0.24, 0.72, 0, -0.44, 0.3), 0, 0),
  1.02
)

/**
 * Gelee : blob gras a haut dome — la tete ronde du modele (ellipse plus haute
 * que large) domine, les flancs debordent en deux petites ailerons et le fond
 * fond en trois gouttes rondes, frange peue sous la masse. La silhouette
 * n'est pas figee : `skirt` decrit une onde qui parcourt toute la jupe a chaque
 * image (cf. skirtWave dans shape.ts). Le dome est une ellipse PURE (pas
 * d'exposant) sur 17 points : tout exposant aplatit le sommet, et 9 points
 * decalent leurs cassures par rapport aux 64 rayons — d'ou des vagues.
 * Le sommet porte un plat de 0.008 : un point unique a x=0 rend l'arete
 * miroir degenerique et le ray-cast vertical rate alors le sommet (rayon nul).
 */
/** Demi-contour droit du gelee (dome + flanc + aileron + fonte) ; le reste par symetrie. */
const DEMI_GELEE = [
  // dome : quart d'ellipse vertical sur 17 points — la tete prend les deux tiers
  ...Array.from({ length: 17 }, (_, i) => {
    const a = -Math.PI / 2 + (i / 16) * (Math.PI / 2)
    return { x: i === 0 ? 0.004 : 0.97 * Math.cos(a), y: 1.08 * Math.sin(a) }
  }),
  // flanc, aileron, puis fonte : trois gouttes (largeur > profondeur,
  // fond arrondi sur deux points, creux remontes a 0.69)
  { x: 1.01, y: 0.15 },
  { x: 1.03, y: 0.32 },
  { x: 1.04, y: 0.44 },
  { x: 1.09, y: 0.53 },
  { x: 0.96, y: 0.58 },
  { x: 0.84, y: 0.63 },
  { x: 0.72, y: 0.72 },
  { x: 0.62, y: 0.82 },
  { x: 0.52, y: 0.88 },
  { x: 0.4, y: 0.87 },
  { x: 0.32, y: 0.76 },
  { x: 0.23, y: 0.69 },
  { x: 0.13, y: 0.8 },
  { x: 0.04, y: 0.9 },
  { x: -0.06, y: 0.9 },
  { x: -0.16, y: 0.8 },
  { x: -0.25, y: 0.69 },
  { x: -0.34, y: 0.76 },
  { x: -0.44, y: 0.87 },
  { x: -0.54, y: 0.88 },
  { x: -0.64, y: 0.82 },
  { x: -0.74, y: 0.72 },
  { x: -0.86, y: 0.63 },
  { x: -0.98, y: 0.58 },
  { x: -1.09, y: 0.53 },
  { x: -1.06, y: 0.44 },
  { x: -1.05, y: 0.32 },
  { x: -1.03, y: 0.15 }
]

const gelee = normalize(
  profileFromPolygon(
    [
      ...DEMI_GELEE,
      // fermeture par symetrie de la calotte (le sommet plat reste unique)
      ...DEMI_GELEE.filter((p) => p.y < -0.01)
        .map((p) => ({ x: -p.x, y: p.y }))
        .reverse()
    ],
    0,
    0.02
  ),
  1.02
)

/** Onde de jupe du gelee : deux cretes, la jupe entiere ondule d'un bloc. */
const JUPE_GELEE: SkirtWave = { amp: 0.055, waves: 2, band: 1.1, period: 1.7 }

/** Reflets du gelee : gros halo incline a gauche, petit eclat en haut a droite. */
const REFLETS_GELEE: ShapeGloss[] = [
  { cx: -0.4, cy: -0.55, rx: 0.15, ry: 0.095, rot: -35, opacity: 0.85 },
  { cx: 0.38, cy: -0.62, rx: 0.07, ry: 0.045, opacity: 0.65 }
]

export const SHAPES: BotShape[] = [
  { id: 'cercle', radii: new Array(PROFILE_SAMPLES).fill(1) },
  { id: 'galet', radii: pebble },
  // 1.15 et pas 1.02 : sur une superellipse le rayon maximal est la diagonale,
  // donc normaliser dessus donne une forme qui parait plus petite que le cercle.
  { id: 'squircle', radii: normalize(superellipseProfile(4.2), 1.15) },
  { id: 'capsule', radii: capsule },
  // -90deg : un sommet vers le haut de l'ecran (y est oriente vers le bas)
  { id: 'triangle', radii: regularPolygonProfile(3, 1.12, 0.34, -90) },
  // 0deg : sommets a gauche et a droite, donc aretes du haut et du bas plates
  { id: 'hexagone', radii: regularPolygonProfile(6, 1.04, 0.26, 0) },
  { id: 'nuage', radii: cloud },
  { id: 'goutte', radii: droplet },
  { id: 'pudding', radii: pudding },
  {
    id: 'gelee',
    radii: gelee,
    skirt: JUPE_GELEE,
    gloss: REFLETS_GELEE,
    eye: GOO_EYES.nuit,
    blush: '#ff8a70'
  }
]

// Map indexee par `string` et non par `ShapeId` : les appelants interrogent avec
// une valeur relue du localStorage ou d'une prop, donc non validee.
export const SHAPE_BY_ID = new Map<string, BotShape>(SHAPES.map((s) => [s.id, s]))
export const DEFAULT_SHAPE = 'cercle'

export type ColorId =
  | 'encre'
  | 'creme'
  | 'brun'
  | 'rouge'
  | 'orange'
  | 'ambre'
  | 'vert'
  | 'turquoise'
  | 'bleu'
  | 'violet'
  | 'rose'
  | 'gris'

export interface BotColor {
  id: ColorId
  hex: string
}

/** Palette du personnalisateur d'origine. */
export const COLORS: BotColor[] = [
  { id: 'encre', hex: '#0a0a0c' },
  { id: 'brun', hex: '#8b5e3c' },
  { id: 'rouge', hex: '#e8483f' },
  { id: 'orange', hex: '#f08a24' },
  { id: 'ambre', hex: '#f0b429' },
  { id: 'vert', hex: '#3ecf8e' },
  { id: 'turquoise', hex: '#2fbfa0' },
  { id: 'bleu', hex: '#3b93f0' },
  { id: 'violet', hex: '#8b5cf6' },
  { id: 'rose', hex: '#e152b0' },
  { id: 'gris', hex: '#a3a3a3' },
  { id: 'creme', hex: '#f1efe9' }
]

export const COLOR_BY_ID = new Map<string, BotColor>(COLORS.map((c) => [c.id, c]))
export const DEFAULT_COLOR = 'encre'

/** Melange deux couleurs hex. Sert a la brume de profondeur des particules. */
export function mixHex(from: string, to: string, t: number): string {
  const parse = (h: string) => {
    const v = parseInt(h.slice(1), 16)
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
  }
  const a = parse(from)
  const b = parse(to)
  const c = a.map((x, i) => Math.round(x + (b[i]! - x) * t))
  return `#${c.map((x) => x.toString(16).padStart(2, '0')).join('')}`
}
