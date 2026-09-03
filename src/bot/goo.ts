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
  /** pupille dans l'oeil : carree (curseur de terminal) ou ronde */
  pupil?: 'none' | 'square' | 'round'
  /** antenne au sommet : tige droite ou en S (serpentin) */
  antenna?: 'none' | 'rod' | 'curl'
  /** la bille du bout s'allume en ambre — l'etat « en train de penser » */
  glow?: boolean
  /** deux points de joues, la chaleur de l'ESFJ */
  blush?: boolean
}

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
