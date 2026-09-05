import { PROFILE_SAMPLES } from './profiles'
import {
  hullOfCircles,
  profileFromPolygon,
  regularPolygonProfile,
  sparkleProfile,
  superellipseProfile,
  unionOfCirclesProfile,
  type ShapeWave
} from './shape'

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
  | 'etincelle'
  | 'flamme'

export interface BotShape {
  id: ShapeId
  radii: number[]
  /** onde propre a la forme : presente, le moteur fait vivre le profil */
  wave?: ShapeWave
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
 * Etincelle : quatre pointes sur les axes, vallees concaves — la superformule
 * de Gielis evaluee sur les 64 angles. n1 = 0,6 et n = 1 donnent le rapport
 * vallee/pointe mesure sur la feuille de candidats (~0,56) : le character
 * « ✨ » avec des pointes assez douces pour un bot, et de la place pour les yeux.
 * Son onde fait pulser les pointes, vallees fixes.
 */
const SCINTILLE: ShapeWave = { amp: 0.05, period: 1.8, lobes: 4, focus: 2, phase: 0 }
const spark = normalize(sparkleProfile(0.6, 1), 1.04)

/**
 * Flamme : contour TRACE sur le vrai emoji 🔥 puis affine — 512 rayons sur un
 * rendu canvas 1400 px, re-echantillonnes en 64 secteurs dans le cadre valide
 * (origine ajustee pour reproduire le contour approuve) : base reguliere sans
 * marche, langue gauche nette, encoche droite bien creusee, pointe fidele.
 * Cinq series de construction analytique (cônes de puissance sur boule)
 * n'avaient jamais produit la lecture « feu » — le trace, si. L'onde est
 * orientee vers le haut (rot = -pi/2) : la couronne ondule comme un feu, la
 * base du corps reste posee.
 */
const VACILLE: ShapeWave = { amp: 0.09, period: 1.4, lobes: 1, focus: 3, phase: 0, rot: -Math.PI / 2 }
const FLAMME_TRACE = [
  0.742, 0.77, 0.794, 0.816, 0.844, 0.865, 0.87, 0.873, 0.873, 0.97, 0.97, 0.969, 0.97, 0.977,
  0.982, 0.991, 1.0, 1.005, 1.02, 1.017, 1.014, 1.014, 1.012, 1.008, 1.008, 0.899, 0.898, 0.891,
  0.88, 0.862, 0.839, 0.802, 0.773, 0.739, 0.711, 0.758, 0.794, 0.819, 0.82, 0.813, 0.837, 0.534,
  0.569, 0.611, 0.651, 0.628, 0.647, 0.877, 1.012, 0.943, 0.892, 0.849, 0.814, 0.782, 0.753, 0.722,
  0.681, 0.641, 0.596, 0.548, 0.521, 0.692, 0.708, 0.726
]
const flamme = normalize(FLAMME_TRACE, 1.02)

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
  { id: 'etincelle', radii: spark, wave: SCINTILLE },
  { id: 'flamme', radii: flamme, wave: VACILLE }
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
