<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, triggerRef, watch } from 'vue'
import { NOTIF_BLUE } from '@/bot/decor'
import { BotEngine, type BotFrame } from '@/bot/engine'
import { clamp, easings } from '@/bot/math'
import { lookTarget, TURN_TIME, type GazeScript } from '@/ui/gaze'
import {
  DEFAULT_EXPRESSION,
  EXPRESSION_BY_ID,
  type BotExpression
} from '@/bot/expressions'
import {
  COLOR_BY_ID,
  DEFAULT_COLOR,
  DEFAULT_SHAPE,
  SHAPE_BY_ID,
  mixHex
} from '@/bot/skins'
import { blockAt, defaultCycle, offsetOf, type Block } from '@/bot/cycles'
import { antennaRig, blushAttrs, eyeDecor, pupilSize, roundifyExpression, type GooSkin } from '@/bot/goo'
import { DEMI_VIEWBOX, RAYON } from '@/bot/repere'
import { STATE_BY_ID, type StateId } from '@/bot/states'

const props = withDefaults(
  defineProps<{
    size?: number
    /** identifiant de forme du personnalisateur */
    shape?: string
    /** identifiant de couleur du personnalisateur */
    color?: string
    /** identifiant d'expression de repos du personnalisateur */
    expression?: string
    /** couleur du fond, utilisee pour la brume de profondeur des particules */
    paper?: string
    /**
     * Fige le rendu a cette date (en secondes depuis le debut de l'etat).
     * Le moteur etant une fonction pure du temps, on obtient une image
     * reproductible au pixel pres, sans boucle d'animation : utile pour une
     * planche d'etats, une vignette de personnalisateur ou un test.
     */
    frozenAt?: number
    /**
     * Montage joue par le lecteur : une suite d'etats, chacun tenu la duree de
     * son bloc. Par defaut, le cycle releve sur la video.
     */
    cycle?: Block[]
    /**
     * Le regard suit le pointeur. Hors de portee des vignettes figees, qui n'ont
     * pas de boucle d'animation : les brancher reveillerait autant de boucles
     * qu'il y a de cases.
     */
    follow?: boolean
    /**
     * Regard scripte de l'arrivee : evalue a chaque image avec le temps ecoule
     * depuis qu'il a ete pose. Independant de `follow`, qui vise le pointeur —
     * ici c'est le script qui decide de tout, y compris de sa duree.
     */
    gaze?: GazeScript | null
    /**
     * Vignette plate : la tete revient en face (yaw/pitch a zero, le roulis
     * reste) et seule la GEOMETRIE des yeux — forme, ecart, inclinaison —
     * porte l'expression. Sert aux tuiles du personnalisateur, ou l'on veut
     * lire une emotion d'un coup d'oeil, pas retrouver la pose de la video.
     */
    flat?: boolean
    /**
     * Demi-cote du viewBox. Les vignettes du personnalisateur (formes et
     * expressions) partagent `THUMB_VIEWBOX` pour que chaque grille soit a la meme
     * echelle. Sans `viewBox`, on garde `DEMI_VIEWBOX` qui loge les anneaux.
     */
    viewBox?: number
    /**
     * La peau « Goo » : yeux ronds, pupille, antenne, joues. Toutes les couches
     * sont facultatives et se posent par-dessus le rendu du moteur — sans `goo`,
     * le bot d'origine, au pixel pres.
     */
    goo?: GooSkin | null
  }>(),
  {
    size: 320,
    shape: DEFAULT_SHAPE,
    color: DEFAULT_COLOR,
    expression: DEFAULT_EXPRESSION,
    paper: '#f9f9f9',
    frozenAt: undefined,
    cycle: () => defaultCycle().blocks,
    follow: false,
    gaze: null,
    flat: false,
    goo: null
  }
)

/**
 * Le curseur de lecture est un **index de bloc**, pas un etat : un montage peut
 * jouer deux fois le meme etat, et il faut alors savoir dans lequel des deux on
 * se trouve. `state` suit le bloc courant — c'est une sortie, l'exterieur pilote
 * la lecture par `block`.
 */
const block = defineModel<number>('block', { default: 0 })
const state = defineModel<StateId>('state', { default: 'idle' })
const playing = defineModel<boolean>('playing', { default: false })
/** Temps ecoule dans le bloc courant, pour la tete de lecture de la timeline. */
const elapsed = defineModel<number>('elapsed', { default: 0 })

// Le repere vient de `src/bot/` : c'est lui qui definit ce que le moteur rend, le
// composant n'en est qu'un client. Les noms courts restent, ils sont partout dans le
// gabarit.
const R = RAYON
/**
 * Fenêtre de vue. Par défaut `DEMI_VIEWBOX` (loge les anneaux). Les tuiles du
 * personnalisateur passent un `viewBox` explicite pour resserrer la fenêtre sur la
 * boule — la montrer arrondie, pas rognée en carré — et rester a la meme echelle
 * d'une grille a l'autre.
 */
const VB = computed(() => props.viewBox ?? DEMI_VIEWBOX)

const shapeRadii = computed(() => SHAPE_BY_ID.get(props.shape)?.radii ?? null)
/**
 * La peau Goo peut imposer SA silhouette (le labo de design explore des formes
 * hors personnalisateur) : elle passe devant le choix du personnalisateur.
 */
const gooRadii = computed(() => props.goo?.shape ?? shapeRadii.value)
const ink = computed(() => COLOR_BY_ID.get(props.color)?.hex ?? '#0a0a0c')
const expression = computed(() => {
  const e = EXPRESSION_BY_ID.get(props.expression) ?? null
  let resolved: BotExpression | null = e
  if (e && props.flat) {
    // Tuile de personnalisateur : on remet la tete en face pour que la FORME des
    // yeux lise l'emotion (cf. prop `flat`). L'id, l'ecart et la geometrie restent
    // ceux de l'expression — `decalageDesYeux` s'appuie dessus.
    resolved = { ...e, gaze: { yaw: 0, pitch: 0, roll: e.gaze.roll } }
  }
  // Peau Goo : les yeux ronds sont une reecriture de l'expression de repos, pas
  // une couche de rendu — le moteur doit morpher vers eux comme vers toute
  // expression. L'id survive, donc la table des decalages reste valable.
  if (resolved && props.goo?.round) {
    resolved = roundifyExpression(resolved, props.goo.round)
  }
  return resolved
})

const engine = new BotEngine(R, state.value, gooRadii.value, expression.value)
const frame = shallowRef<BotFrame>(engine.sample(props.frozenAt ?? 0))
const uid = Math.random().toString(36).slice(2, 8)
const maskId = `bot-mask-${uid}`

/* ------------------------------------------------------------ peau Goo */

/**
 * L'antenne se redessine a chaque image : son ancre est le sommet du corps,
 * qui bouge avec la respiration et les squash. La geometrie vient de
 * `antennaRig` (pur) — ici il n'y a que le branchement sur l'horloge de scene.
 * La phase propre a chaque instance evite la parade synchronisee quand
 * plusieurs bots sont affiches cote a cote.
 */
const antenna = shallowRef<{ rig: ReturnType<typeof antennaRig>; halo: number } | null>(null)
const antennaPhase = ((parseInt(uid, 36) % 100) / 100) * Math.PI * 2

/** Couleur d'ambiance de la bille allumee : l'ambre de la palette d'origine. */
const GLOW_COLOR = COLOR_BY_ID.get('ambre')!.hex

function drawAntenna() {
  const skin = props.goo
  if (!skin?.antenna || skin.antenna === 'none') {
    antenna.value = null
    return
  }
  antenna.value = {
    rig: antennaRig(frame.value.top, skin.antenna, clock, antennaPhase, R * 0.3),
    halo: 0.2 + 0.16 * Math.sin((clock / 1.2) * Math.PI * 2)
  }
}

let raf = 0
let nextAt = Infinity
let last = 0
let clock = 0
/** Date d'horloge a laquelle le bloc courant a commence. */
let blockStart = 0

/* ---------------------------------------------------- l'oeil en couleur */

const gooEyeGradId = `goo-eye-${uid}`
const gooEyeFill = computed(() =>
  props.goo?.eye?.fill2 ? `url(#${gooEyeGradId})` : (props.goo?.eye?.fill ?? '')
)
const gooHi = computed(() => props.goo?.eye?.hi ?? 0.9)

/**
 * Pose le bloc `i` : etat, moteur, et date de fin. Appele aussi bien par la
 * boucle que par le watcher, d'ou l'absence d'effet de bord sur `block` — c'est
 * l'appelant qui decide s'il deplace le curseur.
 */
function apply(i: number, from = 0) {
  const b = props.cycle[i]
  if (!b) {
    nextAt = Infinity
    return
  }
  blockStart = clock - from
  elapsed.value = from
  state.value = b.state
  engine.setState(b.state, clock)
  nextAt = playing.value ? blockStart + b.duration : Infinity
}

/** Deplace le curseur et recale le moteur dans la foulee, sans passer par le watcher. */
function goToBlock(i: number) {
  block.value = i
  apply(i)
}

/**
 * Deplacement de la tete de lecture depuis la timeline : on tombe au milieu d'un
 * bloc, pas a son debut. L'offset transite par une variable plutot que par un
 * appel direct a `apply` : changer `block` declenchera le watcher, qui doit
 * poser la meme date que nous — sinon il remettrait le bloc a zero juste apres.
 */
let pendingOffset = 0

function seek(index: number, offset = 0) {
  if (block.value === index) {
    apply(index, offset)
    return
  }
  pendingOffset = offset
  block.value = index
}

/**
 * Rend le MONTAGE a la date absolue `t`, sans horloge. C'est ce qui permet de
 * capturer un cycle entier hors ecran, image par image et plus vite que le temps
 * reel.
 *
 * Pourquoi une methode a part, et pas `frozenAt` : `frozenAt` fige le temps DANS
 * l'etat courant, il ne parcourt pas les blocs. Et passer par `seek` ne suffirait
 * pas — `apply` cale le moteur sur `clock`, qui n'avance que dans la boucle et
 * reste donc a zero en mode fige. Tous les changements d'etat s'enregistreraient
 * a l'instant 0, et les fondus aux jointures de blocs seraient faux.
 *
 * D'ou le `setState` a l'offset ABSOLU du bloc : le moteur date ainsi la
 * transition la ou elle a vraiment lieu dans le cycle, et `sample(t)` retombe sur
 * la meme image que la lecture temps reel aurait produite.
 */
let dernierBloc = -1

function rendAt(t: number) {
  const blocs = props.cycle
  if (!blocs.length) return
  const { index } = blockAt(blocs, t)
  if (index !== dernierBloc) {
    const b = blocs[index]!
    state.value = b.state
    /*
     * Un RETOUR EN ARRIERE repart sans historique, la ou une avancee normale garde l'etat
     * quitte pour le fondre. Sans cette distinction, rejouer l'image 0 apres une passe
     * complete datait le premier etat a l'instant 0 avec le DERNIER en etat precedent, et
     * rendait donc la pose de celui-la : l'export GIF, qui fait deux passes, s'ouvrait sur
     * une boule sans yeux. Le lecteur est ainsi idempotent, et une passe peut etre rejouee
     * autant de fois qu'on veut.
     */
    if (index < dernierBloc) engine.reset(b.state, offsetOf(blocs, index))
    else engine.setState(b.state, offsetOf(blocs, index))
    dernierBloc = index
  }
  frame.value = engine.sample(t)
  triggerRef(frame)
}

defineExpose({ seek, rendAt })

/* ------------------------------------------------------- regard qui suit */

const svg = ref<SVGSVGElement | null>(null)

/** Derniere position connue du pointeur, en coordonnees client. */
let pointer: { x: number; y: number } | null = null
/** true = une cible est posee sur le moteur, donc il y a de quoi relacher. */
let aiming = false
/** Date d'horloge a laquelle le demi-tour a commence. */
let turnSince = 0

function onPointerMove(event: PointerEvent) {
  // Le tactile n'a pas de curseur qui traine : un doigt leve laisserait le
  // regard fige sur le dernier point touche, ce qui se lit comme un bug.
  if (event.pointerType === 'touch') return
  pointer = { x: event.clientX, y: event.clientY }
}

function onPointerLeave() {
  pointer = null
}

function release() {
  if (!aiming) return
  // meme duree qu'a l'aller : la tete revient pendant que la boule redescend
  engine.setLook(null, clock, TURN_TIME)
  aiming = false
}

/**
 * Vise le pointeur. Ne fait que la part DOM du travail — mesurer ou est la boule
 * et ou est le curseur — la regle de regard elle-meme etant dans `@/ui/gaze`.
 *
 * Le rectangle est relu a chaque image plutot que memorise : l'avatar glisse et
 * grandit pendant la transition de vue, un centre garde en cache ferait viser a
 * cote pendant tout le mouvement. La normalisation se fait sur la demi-fenetre et
 * non sur la taille de l'avatar : le regard doit saturer quand le curseur atteint
 * le bord de l'ecran, quelle que soit la place que la boule occupe.
 */
function aim() {
  // Le regard ne se pilote que sur les etats a VISAGE DE REPOS. Ailleurs la pose
  // du regard EST l'animation relevee — l'orbite, par laquelle s'ouvre la vue,
  // fait deja filer les yeux autour de la sphere — et s'y superposer la
  // brouillerait.
  if (!STATE_BY_ID.get(state.value)?.baseFace) {
    release()
    return
  }
  const box = svg.value?.getBoundingClientRect()
  /*
   * Une boite sans surface : il n'y a rien a viser, et surtout la normalisation
   * ci-dessous deviendrait `0 / 0`, donc `NaN`. Or le moteur GARDE la derniere
   * cible : un seul NaN pose une fois y reste pour toujours, et le bot ne se
   * repose plus jamais. Ca arrive pour de vrai quand le volet du navigateur est
   * masque — `getBoundingClientRect` rend alors des zeros.
   */
  if (!box || box.width === 0 || box.height === 0) return
  // le tour part a l'entree dans la vue, en meme temps que les anneaux
  if (!aiming) turnSince = clock
  const demiLargeur = Math.max(1, window.innerWidth / 2)
  const demiHauteur = Math.max(1, window.innerHeight / 2)
  engine.setLook(
    lookTarget({
      nx: pointer ? clamp((pointer.x - (box.left + box.width / 2)) / demiLargeur, -1, 1) : 0,
      ny: pointer ? clamp((pointer.y - (box.top + box.height / 2)) / demiHauteur, -1, 1) : 0,
      tour: easings.easeOutQuint(clamp((clock - turnSince) / TURN_TIME)),
      pointer: pointer !== null
    }),
    clock
  )
  aiming = true
}

/* ------------------------------------------------- regard d'arrivee */

/** Date d'horloge a laquelle le script de regard a ete pose. */
let gazeSince = 0
/** true = un script tourne, donc il y a de quoi relacher. */
let scripted = false

/**
 * Rattrapage court, la ou le suivi du pointeur prend celui du moteur : le script
 * EST l'animation, et laisser le moteur en lisser une seconde par-dessus
 * retarderait son depart d'un quart de seconde — un script qui commence par
 * regarder au loin verrait ses yeux partir de la pose, y revenir, puis repartir.
 *
 * Non nul quand meme : a zero, `lookAtTime` divise zero par zero a l'image ou la
 * cible est posee, et un `NaN` s'installe dans le moteur pour de bon.
 */
const SCRIPT_MORPH = 1 / 60

/**
 * Le script decide de tout, y compris de sa duree : on ne fait que lui donner le
 * temps ecoule. La regle elle-meme est dans `@/ui/gaze`, comme celle du suivi.
 */
function scriptedGaze(run: GazeScript) {
  engine.setLook(run(clock - gazeSince), clock, SCRIPT_MORPH)
}

/**
 * Depart et relachement du script. `immediate` parce que la page s'ouvre DEJA en
 * arrivee — c'est meme son seul usage — et le relachement parce qu'un script
 * coupe avant sa fin (bloc raccourci, changement de vue) laisserait sinon les
 * yeux figes la ou il s'est arrete : le moteur GARDE la derniere cible.
 */
watch(
  () => props.gaze,
  (run) => {
    if (run) {
      gazeSince = clock
      scripted = true
      /*
       * Valeur de depart posee DATEE D'UN RATTRAPAGE PLUS TOT, pour qu'elle soit
       * deja pleinement appliquee a la premiere image.
       *
       * Sans ca, le moteur rend la premiere image avec le regard neutre et la
       * seconde avec celui du script : les yeux sautent d'un coup entre les deux.
       * Discret pour un script qui commence au repos, spectaculaire pour un qui
       * commence en regardant au loin — 127 px d'un coup sur une boule de 100 de
       * rayon, ce qui est exactement le defaut que ces scripts corrigent.
       */
      engine.setLook(run(0), clock - SCRIPT_MORPH, SCRIPT_MORPH)
      return
    }
    if (!scripted) return
    engine.setLook(null, clock)
    scripted = false
  },
  { immediate: true }
)

function tick(ms: number) {
  raf = requestAnimationFrame(tick)
  // Horloge de scene a delta borne : un onglet masque puis reaffiche reprend
  // sans sauter en avant (rAF est suspendu pendant ce temps-la).
  const dt = last ? Math.min((ms - last) / 1000, 0.064) : 0
  last = ms
  clock += dt

  // Le stop ne gele pas l'horloge : arrete, le bot continue de respirer et de
  // cligner. Seuls l'enchainement du montage et la tete de lecture sont
  // suspendus.
  if (playing.value) {
    if (clock >= nextAt && props.cycle.length) {
      goToBlock((block.value + 1) % props.cycle.length)
    } else {
      elapsed.value = clock - blockStart
    }
  }

  // Le suivi prime : les deux ecrivent la meme cible, et l'arrivee est terminee
  // bien avant qu'une vue a suivi ne s'ouvre.
  if (props.follow) aim()
  else if (props.gaze) scriptedGaze(props.gaze)

  frame.value = engine.sample(clock)
  triggerRef(frame)
  drawAntenna()
}

/** Redessine sans la boucle : sert aux vignettes figees quand la forme change. */
function redrawFrozen() {
  if (props.frozenAt === undefined) return
  frame.value = engine.sample(props.frozenAt)
  triggerRef(frame)
  drawAntenna()
}

// Curseur deplace de l'exterieur : clic sur un bloc de la timeline. Quand c'est
// `goToBlock` qui l'a bouge, `apply` est deja passe et repasse ici sans effet
// (setState sort si l'etat n'a pas change, la date de fin est la meme).
watch(block, (i) => {
  apply(i, pendingOffset)
  pendingOffset = 0
})

// Changement d'etat venu d'une prop : c'est le cas des vignettes figees, qui
// n'ont pas de curseur. En lecture, `apply` a deja fait le travail.
//
// Le garde n'est pas une optimisation, il corrompait une image a CHAQUE jointure
// de bloc a l'export : `rendAt` pose l'etat sur le moteur a son offset ABSOLU
// puis echantillonne a la bonne date, mais le watcher — dont la file est videe
// par le `nextTick` de l'export — repassait ensuite un `redrawFrozen()` non
// inerte (le lecteur hors ecran est monte avec `frozenAt: 0`). Or `sample(0)`
// juste apres un changement date a l'offset donne un ratio de melange nul, donc
// la pose de l'etat PRECEDENT : le point d'exclamation revenait au depart de sa
// course pendant une image, treize fois dans le montage par defaut.
watch(state, (id) => {
  // `rendAt` ou `apply` l'a deja applique, et a la bonne date
  if (engine.state === id) return
  engine.setState(id, clock)
  redrawFrozen()
})

// Reprise la ou la tete de lecture s'est arretee, pas au debut du bloc.
watch(playing, (on) => {
  if (on) apply(block.value, elapsed.value)
  else nextAt = Infinity
})

// Le montage a change sous nos pieds : bloc supprime, duree tiree, autre cycle
// choisi. On garde le curseur dans les bornes et on recale la date de fin sur
// la nouvelle duree — si le bloc a ete raccourci sous la position courante, la
// boucle passe au suivant des la frame suivante, ce qui est le comportement
// voulu.
watch(
  () => props.cycle,
  (blocks) => {
    if (!blocks.length) {
      nextAt = Infinity
      return
    }
    const i = Math.min(block.value, blocks.length - 1)
    if (i !== block.value) {
      goToBlock(i)
      return
    }
    nextAt = playing.value ? blockStart + blocks[i]!.duration : Infinity
  }
)

watch(gooRadii, (radii) => {
  // on passe l'horloge : le moteur morphe vers la nouvelle forme au lieu de
  // l'appliquer d'un coup
  engine.setShape(radii, clock)
  redrawFrozen()
})

watch(expression, (expr) => {
  engine.setExpression(expr, clock)
  redrawFrozen()
})

/**
 * Deplacer `frozenAt` redessine. La prop ne servait qu'a poser une vignette une
 * fois pour toutes, donc personne ne la bougeait ; l'export anime, lui, avance
 * image par image sur une instance hors ecran. Sans ce watcher elle reste sur sa
 * premiere image et l'animation exportee ne bouge pas.
 */
watch(() => props.frozenAt, redrawFrozen)

/**
 * L'ecoute du pointeur ne vit que le temps du suivi. `immediate` parce que la
 * vue peut s'ouvrir deja en mode suivi ; le garde sur `frozenAt` parce qu'une
 * vignette figee n'a pas de boucle pour consommer la cible, donc rien a ecouter.
 */
watch(
  () => props.follow && props.frozenAt === undefined,
  (on) => {
    if (on) {
      window.addEventListener('pointermove', onPointerMove)
      document.addEventListener('pointerleave', onPointerLeave)
      return
    }
    detach()
    release()
  },
  { immediate: true }
)

function detach() {
  window.removeEventListener('pointermove', onPointerMove)
  document.removeEventListener('pointerleave', onPointerLeave)
}

onMounted(() => {
  if (props.frozenAt !== undefined) {
    // vignette figee : pas de boucle, l'antenne se dessine une fois pour toutes
    drawAntenna()
    return
  }
  // le curseur peut arriver deja pose (URL, cycle relu du stockage)
  apply(block.value, elapsed.value)
  /*
   * L'antenne se peint des le montage, sans attendre la boucle : un onglet en
   * arriere-plan suspend rAF, et le bot resterait sinon sans antenne jusqu'a
   * sa premiere image — les vignettes cote a cote du labo en faisaient la
   * demonstration.
   */
  drawAntenna()
  raf = requestAnimationFrame(tick)
})
onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  detach()
})

/**
 * Un point est un simple disque, sauf quand l'etat fournit une forme (la
 * goutte du "!" penche) : le path est alors en unites de rayon de boule et
 * centre sur l'origine, donc on le pose avec translate/rotate/scale.
 *
 * La couleur suit celle du corps par defaut ; `depth` sert aux particules, qui
 * se fondent dans le fond a mesure qu'elles s'eloignent.
 */
function dotAttrs(dot: BotFrame['dots'][number]) {
  const fill =
    dot.color ?? (dot.depth === undefined ? ink.value : mixHex(props.paper, ink.value, dot.depth))
  const common = { fill, opacity: dot.opacity }
  return dot.d
    ? {
        ...common,
        d: dot.d,
        transform: `translate(${dot.x} ${dot.y}) rotate(${dot.rot ?? 0}) scale(${R})`
      }
    : { ...common, cx: dot.x, cy: dot.y, r: dot.r }
}
</script>

<template>
  <svg
    ref="svg"
    :width="props.size"
    :height="props.size"
    :viewBox="`${-VB} ${-VB} ${VB * 2} ${VB * 2}`"
    role="img"
    aria-label="G's bot"
  >
    <defs>
      <!--
        Les yeux sont de vrais trous perces dans le corps (comme sur x.ai), pas
        des formes blanches posees dessus : ils restent donc automatiquement
        rognes par la silhouette quand ils glissent vers le bord.
      -->
      <mask
        :id="maskId"
        maskUnits="userSpaceOnUse"
        :x="-VB"
        :y="-VB"
        :width="VB * 2"
        :height="VB * 2"
      >
        <path :d="frame.bodyPath" fill="#fff" />
        <path
          v-for="(eye, i) in frame.eyes"
          :key="i"
          :d="eye.d"
          :transform="eye.matrix"
          :opacity="eye.alpha"
          fill="#000"
        />
        <circle
          v-if="frame.notch"
          :cx="frame.notch.x"
          :cy="frame.notch.y"
          :r="frame.notch.r"
          fill="#000"
        />
      </mask>

      <!--
        Le degrade de l'oeil en couleur : en unites de bounding box du path,
        donc il suit la matrice de l'oeil (rotation, clignement) sans rien
        demander au moteur.
      -->
      <linearGradient
        v-if="props.goo?.eye?.fill2"
        :id="gooEyeGradId"
        x1="0"
        y1="0"
        x2="0"
        y2="1"
      >
        <stop offset="0" :stop-color="props.goo.eye.fill" />
        <stop offset="1" :stop-color="props.goo.eye.fill2" />
      </linearGradient>

      <linearGradient
        v-for="arc in frame.arcs"
        :id="`${uid}-${arc.id}`"
        :key="arc.id"
        gradientUnits="userSpaceOnUse"
        :x1="arc.grad.x1"
        :y1="arc.grad.y1"
        :x2="arc.grad.x2"
        :y2="arc.grad.y2"
      >
        <stop
          v-for="(c, i) in arc.grad.stops"
          :key="i"
          :offset="i / (arc.grad.stops.length - 1)"
          :stop-color="c"
        />
      </linearGradient>
    </defs>

    <!-- moitie arriere des orbites : dessinee avant le corps, donc occultee -->
    <g fill="none" stroke-linecap="round">
      <path
        v-for="arc in frame.arcs"
        :key="`b${arc.id}`"
        :d="arc.back"
        :stroke="`url(#${uid}-${arc.id})`"
        :stroke-width="arc.width"
        :opacity="arc.opacity"
      />
    </g>

    <!-- particules de l'eclatement : elles passent derriere le noyau -->
    <g v-if="frame.dotsBehind">
      <component
        :is="dot.d ? 'path' : 'circle'"
        v-for="(dot, i) in frame.dots"
        :key="`pb${i}`"
        v-bind="dotAttrs(dot)"
      />
    </g>

    <g :opacity="frame.bodyAlpha">
      <!--
        Fond opaque a la forme exacte du corps, sous le corps lui-meme.

        Les yeux sont des TROUS perces dans le corps, pas des formes blanches
        posees dessus : c'est ce qui les fait rogner tout seuls au bord de la
        silhouette, et ca ne change pas. Mais un trou laisse voir ce qui est
        dessine derriere — or la moitie arriere des anneaux et les particules de
        l'eclatement le sont justement, pour etre occultees par le corps. Sans ce
        fond, un anneau qui passe derriere la boule reapparait DANS les yeux.

        Rempli avec `paper` et non en blanc pur : c'est exactement ce que les yeux
        laissaient voir jusqu'ici, le fond de la page. Les mettre en blanc les
        rendrait plus clairs que le fond, ce qui se verrait sur une grande boule.
      -->
      <path :d="frame.bodyPath" :fill="props.paper" />
      <g :mask="`url(#${maskId})`">
        <rect :x="-VB" :y="-VB" :width="VB * 2" :height="VB * 2" :fill="ink" />
      </g>

      <!--
        L'oeil EN COULEUR : le meme path que le trou, pose par-dessus, donc il
        le recouvre au pixel pres et herite de tout — orientation de tete,
        inclinaison, clignement (la colonne y de la matrice ecrase), fondue au
        limbe (l'alpha). Le coeur et les reflets vivent dans le meme repere
        local, fournis par `eyeDecor`.
      -->
      <g v-if="props.goo?.eye">
        <template v-for="(eye, i) in frame.eyes" :key="`gooeye${i}`">
          <path :d="eye.d" :transform="eye.matrix" :fill="gooEyeFill" :opacity="eye.alpha" />
          <circle
            v-if="props.goo.eye.core"
            :transform="eye.matrix"
            :cy="eyeDecor(eye).coreCy"
            :r="eyeDecor(eye).coreR"
            :fill="props.goo.eye.core"
            :opacity="eye.alpha"
          />
          <template v-if="gooHi > 0">
            <circle
              :transform="eye.matrix"
              :cx="eyeDecor(eye).hi1.cx"
              :cy="eyeDecor(eye).hi1.cy"
              :r="eyeDecor(eye).hi1.r"
              fill="#fff"
              :opacity="gooHi * eye.alpha"
            />
            <circle
              :transform="eye.matrix"
              :cx="eyeDecor(eye).hi2.cx"
              :cy="eyeDecor(eye).hi2.cy"
              :r="eyeDecor(eye).hi2.r"
              fill="#fff"
              :opacity="gooHi * eye.alpha"
            />
          </template>
        </template>
      </g>

      <!--
        La pupille encre : seulement sans oeil en couleur (l'oeil colore a son
        propre coeur). La matrice de l'oeil lui transmet tout gratuitement.
      -->
      <g v-if="props.goo?.pupil && props.goo.pupil !== 'none' && !props.goo.eye">
        <template v-for="(eye, i) in frame.eyes" :key="`pupil${i}`">
          <rect
            v-if="props.goo.pupil === 'square'"
            :transform="eye.matrix"
            :x="-pupilSize(eye) / 2"
            :y="-pupilSize(eye) / 2"
            :width="pupilSize(eye)"
            :height="pupilSize(eye)"
            :fill="ink"
            :opacity="eye.alpha"
          />
          <circle
            v-else
            :transform="eye.matrix"
            :r="pupilSize(eye) / 2"
            :fill="ink"
            :opacity="eye.alpha"
          />
        </template>
      </g>

      <!-- Les joues : deux points d'encre diluee, pousses sous l'oeil vers l'exterieur. -->
      <g v-if="props.goo?.blush" :fill="ink" opacity="0.1">
        <ellipse v-for="(eye, i) in frame.eyes" :key="`blush${i}`" v-bind="blushAttrs(eye, R)" />
      </g>
    </g>

    <!-- L'antenne : ancree au sommet du corps, elle suit respiration et squash. -->
    <g v-if="antenna" stroke-linecap="round">
      <path :d="antenna.rig.d" fill="none" :stroke="ink" :stroke-width="R * 0.05" />
      <circle
        v-if="props.goo?.glow"
        :cx="antenna.rig.tip.x"
        :cy="antenna.rig.tip.y"
        :r="antenna.rig.ballR * 2.4"
        :fill="GLOW_COLOR"
        :opacity="Math.max(0, antenna.halo)"
      />
      <circle
        :cx="antenna.rig.tip.x"
        :cy="antenna.rig.tip.y"
        :r="antenna.rig.ballR"
        :fill="props.goo?.glow ? GLOW_COLOR : ink"
      />
    </g>

    <g v-if="!frame.dotsBehind">
      <component
        :is="dot.d ? 'path' : 'circle'"
        v-for="(dot, i) in frame.dots"
        :key="`pf${i}`"
        v-bind="dotAttrs(dot)"
      />
    </g>

    <circle
      v-if="frame.notif"
      :cx="frame.notif.x"
      :cy="frame.notif.y"
      :r="frame.notif.r"
      :fill="NOTIF_BLUE"
    />

    <!-- moitie avant des orbites -->
    <g fill="none" stroke-linecap="round">
      <path
        v-for="arc in frame.arcs"
        :key="`f${arc.id}`"
        :d="arc.front"
        :stroke="`url(#${uid}-${arc.id})`"
        :stroke-width="arc.width"
        :opacity="arc.opacity"
      />
    </g>
  </svg>
</template>
