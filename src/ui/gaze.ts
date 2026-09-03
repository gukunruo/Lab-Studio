// Imports relatifs : `src/bot` est consomme tel quel par les tests node (tsx
// ne resout pas les alias `@/`), et tout le dossier evite les alias pour cette raison.
import type { Look } from '../bot/engine'
import type { ExpressionId } from '../bot/expressions'
import { clamp, easings } from '../bot/math'

/**
 * Ou le bot regarde quand il suit le curseur. Pur, comme `src/ui/timeline.ts` :
 * la position du pointeur entre en coordonnees deja normalisees, donc la regle
 * se teste sans DOM — et elle a besoin de l'etre, parce que deux signes s'y
 * trompent facilement.
 */

/**
 * Angles en degres d'orientation de tete quand le bot suit le curseur. CHOISIS,
 * pas releves : la video de reference ne montre aucun suivi de curseur.
 *
 * Assez amples pour que le bot TOURNE la tete vers le curseur — les yeux se
 * detachent nettement du centre, comme sur bloub.vercel.app — et bornees pour
 * que rien ne quitte la sphere : avec les yeux ecartes de ±15,46deg
 * (`EYE_SPLIT`), le lacet maximal met l'oeil externe a ~51deg de la normale,
 * profondeur 0,62 — encore bien visible, la compression orthographique et le
 * masque du contour faisant le reste.
 */
export const YAW_MAX = 36
export const PITCH_MAX = 26

/**
 * Tour complet parcouru EN CHEMIN : les yeux ne glissent pas en travers du
 * visage, ils font le tour de la boule avant d'arriver.
 *
 * C'est gratuit parce que les yeux vivent sur une sphere : passe 90deg de lacet
 * ils franchissent le limbe, le moteur les retire de l'image, puis ils
 * reapparaissent de l'autre cote. Le tourbillon n'est donc pas un effet pose
 * par-dessus, c'est la meme projection orthographique poussee d'un tour.
 *
 * Et surtout : il ATTERRIT JUSTE par construction, `-360deg` etant le meme angle
 * que `0`. C'est ce qui le distingue d'une pose de regard ecrite dans un etat,
 * qui laisse les yeux la ou sa courbe se termine.
 */
export const SPIN = 360

/**
 * Duree du tour. Un peu plus courte que le bloc d'entree (`swirl`) : les yeux
 * doivent etre posees avant que les anneaux ne s'effacent.
 */
export const TURN_TIME = 1.1

/**
 * Humeurs que le bot traverse pendant qu'il suit le curseur.
 *
 * Toutes ont un ROULIS NUL, et c'est le critere de selection. Le lacet et le
 * tangage sont neutralises par le suivi (ils sont absolus), mais pas le roulis —
 * il fait pencher la tete, donc il deplace les yeux verticalement, et une humeur
 * a -15deg suivie d'une a +8 les fait sauter. Ce qui reste pour distinguer les
 * humeurs, c'est la FORME des yeux : ronds, plisses, ecarquilles, aplatis. C'est
 * largement suffisant, et c'est ce qui se lit.
 *
 * Ce n'est donc pas une liste de gouts : y ajouter « curieux » (roulis -15deg)
 * ramenerait le saut.
 */
export const HUMEURS: readonly ExpressionId[] = [
  'surpris',
  'heureux',
  'hilare',
  'excite',
  'fier',
  'blase'
]

/* ------------------------------------------------ regards de l'arrivee */

/**
 * Un regard SCRIPTE : evalue a chaque image avec le temps ecoule depuis le debut
 * de l'arrivee, en secondes. Le script porte donc sa propre horloge et peut
 * enchainer plusieurs mouvements — le composant ne fait que l'evaluer et n'a
 * aucune duree a connaitre.
 *
 * REGLE, et c'est elle qui rend un script sans entretien : il doit FINIR a
 * `mix: 0`, ou la pose de l'etat commande seule. Il n'y a alors jamais rien a
 * relacher, et ce relachement — qui se verrait sous la forme d'un dernier
 * glissement des yeux, juste quand tout devrait etre pose — n'existe pas.
 *
 * Le type reste general alors qu'il n'y a qu'un script aujourd'hui : quatre ont
 * ete ecrits et compares cote a cote avant d'en garder un, et c'est cette forme
 * qui a permis de les essayer sans toucher au moteur.
 */
export type GazeScript = (t: number) => Look

/**
 * « Le tour » : la boule a l'air de tourner sur elle-meme.
 *
 * `mix` reste a ZERO du debut a la fin : aucune direction n'est imposee, seul
 * `spin` fond, ce qui fait passer les yeux DERRIERE la boule avant de les
 * ramener exactement la ou l'expression choisie les met.
 *
 * Ease-in-OUT et non l'ease-out exponentiel du reste du projet : ce n'est pas une
 * valeur qui se pose, c'est un objet qui tourne. En ease-out, les deux tiers du
 * tour etaient avales en 0,3 s — un a-coup, pas une rotation.
 *
 * Il est VIF au passage du limbe — 20 px entre deux images sur une boule de 100
 * de rayon — et ce n'est pas un defaut de reglage : pres du bord, un petit angle
 * devient un grand deplacement a l'ecran, et l'oeil disparait puis reparait de
 * l'autre cote. Ralentir n'y change rien, c'est la trajectoire qui veut ca, et
 * c'est justement ce qui fait l'effet. Ne pas chercher a l'adoucir.
 *
 * Corollaire indispensable : ce tour ne se joue que sur un CERCLE. Les yeux sont
 * recolles au contour reel (`radiusAtAngle`), donc sur une forme non circulaire
 * ils suivent le profil en tournant et sautillent. Voir `forme` dans `App.vue`.
 */
export const TOUR_TIME = 1.5

export const tourLook: GazeScript = (t) => ({
  yaw: 0,
  pitch: 0,
  mix: 0,
  spin: SPIN * (1 - easings.easeInOutCubic(clamp(t / TOUR_TIME))),
  wander: 1
})

export interface Aim {
  /** ecart horizontal du pointeur au centre du bot, -1 a 1 (droite positive) */
  nx: number
  /** ecart vertical, -1 a 1, dans le sens de l'ecran (bas positif) */
  ny: number
  /** avancement de l'arrivee, 0 a 1 */
  tour: number
  /** false = aucun pointeur connu : le regard reste droit devant, mais il revit */
  pointer: boolean
}

/**
 * Cible de regard : le curseur, tout simplement.
 *
 * `nx`/`ny` sont l'ecart du pointeur au centre du bot, deja normalises et
 * bornes. Ils se lisent DIRECTEMENT comme la direction de la tete, dans la
 * convention de `face.ts` : a droite lacet positif, en bas tangage negatif —
 * le y de l'ecran descend, le tangage positif monte, d'ou le signe. Curseur au
 * centre, regard droit devant : c'est le « il me fixe » recherche. Aucun biais
 * lateral : l'ancien cap « vers le panneau » faisait regarder a gauche meme
 * quand le curseur etait ailleurs.
 *
 * `tour` mene tout : il fait monter l'emprise sur la pose (`mix`) et fondre le
 * tour parcouru (`spin`) en meme temps. A 0 la pose de l'etat commande seule ;
 * a 1 la tete est posee sur le curseur et le suit.
 *
 * Rien ici ne compense l'expression affichee : c'est le moteur qui melange,
 * parce que lui seul connait la pose a l'instant t. Le faire ici obligerait a
 * lire le lacet d'ARRIVEE de l'expression pendant que le moteur, lui, morphe
 * encore — et les yeux sautaient a chaque changement d'humeur.
 */
export function lookTarget({ nx, ny, tour, pointer }: Aim): Look {
  return {
    yaw: nx * YAW_MAX,
    pitch: -ny * PITCH_MAX,
    mix: tour,
    spin: SPIN * (1 - tour),
    // Sans pointeur le regard reste droit devant, mais on lui rend sa derive :
    // sinon le bot fixe un point mort, et arriver au clavier ou au tactile
    // donnait un avatar completement immobile.
    wander: pointer ? 0 : 1
  }
}
