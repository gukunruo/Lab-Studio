import type { RenderedEye } from './engine'
import type { BotExpression } from './expressions'
import { r2, TAU } from './math'

/**
 * La peau « Goo » : les choix d'identite du bot de G, poses SUR le moteur sans
 * le toucher. Trois couches, chacune pure et testable :
 *
 * - les yeux RONDS : une reecriture de l'expression de repos (la forme des yeux
 *   est une donnee de l'expression, pas du moteur) ;
 * - la pupille : un carre d'encre DANS le trou de l'oeil — l'oeil est un trou
 *   percer au masque, donc dessiner de l'encre par-dessus le corps suffit, et la
 *   matrice de l'oeil lui transmet rotation et clignement gratuitement ;
 * - l'antenne : une tige ancree au sommet du corps (`frame.top`), qui se balance
 *   d'un balancement propre au temps.
 *
 * Le labo de design (`/bloub?goo`) rend ces variantes cote a cote AVANT qu'une
 * soit choisie — c'est le contrat : rien ici ne devienne defaut sans avoir ete
 * vu en vrai rendu.
 */

/** Les options de peau, toutes facultatives : sans elles, le bot d'origine. */
export interface GooSkin {
  /** diametre des yeux ronds, en unites de rayon de boule ; absent = capsules d'origine */
  round?: number
  /**
   * L'oeil EN COULEUR : un remplissage pose sur le trou (meme path, meme
   * matrice), avec reflets. Present, il remplace la logique de pupille.
   */
  eye?: GooEye
  /** pupille dans l'oeil : carree (curseur de terminal) ou ronde */
  pupil?: 'none' | 'square' | 'round'
  /** antenne au sommet : tige droite ou en S (serpentin) */
  antenna?: 'none' | 'rod' | 'curl'
  /** la bille du bout s'allume en ambre — l'etat « en train de penser » */
  glow?: boolean
  /** deux points de joues, la chaleur de l'ESFJ */
  blush?: boolean
}

/** L'oeil en couleur : degrade vertical (ou pleine couleur), coeur, reflets. */
export interface GooEye {
  /** couleur pleine, ou premiere couleur du degrade (le HAUT de l'oeil) */
  fill: string
  /** deuxieme couleur du degrade (le BAS) ; absent = couleur pleine */
  fill2?: string
  /** coeur central plus sombre — la pupille; absent = pas de coeur */
  core?: string
  /** intensite des reflets blancs, 0 a 1 ; 0,9 par defaut */
  hi?: number
}

/**
 * Les teintes d'oeil en couleur, partagees par le labo de design et le
 * personnalisateur : le haut de l'oeil plus clair que le bas, reflets blancs.
 * Posees SUR la geometrie d'origine de l'oeil — les 16 expressions gardent
 * leur vocabulaire d'inclinaison et d'ecrasement. `nuit` est le noir profond
 * du gelee, proposee en couleur pleine (pas de degrade).
 */
export const GOO_EYES = {
  ambre: { fill: '#f6c445', fill2: '#c67c05' },
  menthe: { fill: '#4ade8f', fill2: '#17915f' },
  corail: { fill: '#f06455', fill2: '#b02a20' },
  violet: { fill: '#4f9df5', fill2: '#7c4fe0' },
  nuit: { fill: '#17171c' }
} satisfies Record<string, GooEye>

/**
 * Yeux ronds : chaque oeil devient un cercle de `diameter`, la hauteur de
 * `open` (paupiere moitie tombee du somnolent) et l'identite survivant tels
 * quels. Les INCLINAISONS sont perdues — tourner un cercle ne se voit pas — et
 * c'est assume : les expressions qui les portent (colere, triste) gardent leur
 * gueule par la hauteur et l'ecart, pas par le penche, une fois rondes.
 */
export function roundifyExpression(expr: BotExpression, diameter: number): BotExpression {
  return {
    id: expr.id,
    gaze: { ...expr.gaze },
    split: expr.split,
    eyes: [
      { w: diameter, h: diameter, tilt: 0, open: expr.eyes[0]!.open },
      { w: diameter, h: diameter, tilt: 0, open: expr.eyes[1]!.open }
    ]
  }
}

/**
 * Cote de la pupille, en unites de viewBox : une fraction du PETIT cote de
 * l'oeil, pour qu'une pupille carree dans une capsule reste dans la capsule.
 * Le terme de comparaison est le petit cote et non le grand — pendant un
 * clignement, la hauteur fond, et la pupille doit fondre avec.
 */
export function pupilSize(eye: { w: number; h: number }): number {
  return Math.min(eye.w, eye.h) * 0.42
}

/* ------------------------------------------------------- l'oeil en couleur */

export interface EyeDecor {
  /** rayon du coeur central, en unites de viewBox */
  coreR: number
  /** descente du coeur sous le centre, en unites de viewBox */
  coreCy: number
  /** grand reflet, en haut a gauche */
  hi1: { cx: number; cy: number; r: number }
  /** petit reflet en contrebas a droite */
  hi2: { cx: number; cy: number; r: number }
}

/**
 * La decoration de l'oeil en couleur : un coeur, deux reflets. Tout est exprime
 * en coordonnees LOCALES de l'oeil (la matrice du moteur les tourne et les
 * ecrase avec lui, clignement compris). Les fractions sont calibrees pour que
 * les reflets restent DANS l'oeil, quel que soit son rapport — un oeil qui se
 * ferme (la hauteur fond) ne doit pas laisser fuir le reflet sur le corps.
 */
export function eyeDecor(eye: { w: number; h: number }): EyeDecor {
  const rx = eye.w / 2
  const ry = eye.h / 2
  const unit = Math.min(rx, ry)
  return {
    coreR: 0.46 * unit,
    coreCy: 0.12 * ry,
    hi1: { cx: -0.3 * rx, cy: -0.35 * ry, r: 0.3 * unit },
    hi2: { cx: 0.3 * rx, cy: 0.28 * ry, r: 0.15 * unit }
  }
}

/* ------------------------------------------------------------ l'antenne */

export interface AntennaRig {
  /** le path de la tige, de l'ancre (sommet du corps) au bout */
  d: string
  /** la position de la bille du bout, en unites de viewBox */
  tip: { x: number; y: number }
  /** rayon de la bille, deduit de la hauteur de tige */
  ballR: number
}

/**
 * La tige d'antenne : part du sommet du corps, monte de `height`, se penche
 * d'un balancement a deux periodes — une lente qui la fait onduler comme une
 * touffe d'herbe, une rapide qui la fait fremir. Pur : relire une date donne
 * la meme antenne, et deux bots de phases differentes ne se calquent jamais.
 *
 * `rod` plie progressivement dans le sens du balancement ; `curl` repart en
 * sens inverse a mi-hauteur — le serpentin, un clin d'oeil a l'annee du Serpent.
 */
export function antennaRig(
  top: { x: number; y: number },
  style: 'rod' | 'curl',
  t: number,
  phase: number,
  height: number
): AntennaRig {
  const sway =
    Math.sin((t / 2.6) * TAU + phase) * 0.16 + Math.sin((t / 0.9) * TAU + phase * 1.7) * 0.04
  // l'angle local le long de la tige, k de 0 (ancre) a 1 (bout)
  const bend = (k: number) => (style === 'rod' ? sway * k ** 1.6 : sway * Math.sin(k * Math.PI * 1.15))

  const at = (k: number) => {
    const a = bend(k)
    return { x: top.x + Math.sin(a) * height * k, y: top.y - Math.cos(a) * height * k }
  }
  const c1 = at(0.42)
  const c2 = at(0.78)
  const tip = at(1)

  return {
    d: `M${r2(top.x)} ${r2(top.y)}C${r2(c1.x)} ${r2(c1.y)} ${r2(c2.x)} ${r2(c2.y)} ${r2(tip.x)} ${r2(tip.y)}`,
    tip,
    ballR: height * 0.16
  }
}

/* ------------------------------------------------------------ les joues */

/**
 * Les points de joues : sous chaque oeil, pousses vers l'exterieur. La position
 * se lit dans la TRANSLATION de la matrice de l'oeil — c'est le centre de
 * l'oeil a l'ecran, deja en unites de viewBox, deja remonte par le tangage de
 * la tete. Le signe de `e` dit quel oeil est a droite.
 */
export function blushAttrs(eye: RenderedEye, R: number): { cx: number; cy: number; rx: number; ry: number } {
  const parts = eye.matrix.slice('matrix('.length, -1).split(',')
  const e = Number(parts[4])
  const f = Number(parts[5])
  const side = e >= 0 ? 1 : -1
  return {
    cx: r2(e + side * 0.22 * R),
    cy: r2(f + 0.34 * R),
    rx: r2(0.105 * R),
    ry: r2(0.05 * R)
  }
}
