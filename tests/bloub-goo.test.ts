import test from 'node:test'
import assert from 'node:assert/strict'
import {
  blushAttrs,
  antennaRig,
  eyeDecor,
  GOO_EYES,
  pupilSize,
  roundifyExpression
} from '../src/bot/goo'
import { BotEngine } from '../src/bot/engine'
import { EXPRESSION_BY_ID } from '../src/bot/expressions'

// La peau Goo se pose sur le moteur sans le toucher : les yeux ronds sont une
// reecriture d'expression, la pupille un carre d'encre dans le trou, l'antenne
// une tige ancree au sommet du corps. Chaque regle se teste sans DOM, comme le
// regard — et chacune a failli se tromper de signe au moins une fois.

test('roundify : des yeux circulaires, le reste de l\'expression intact', () => {
  const neutre = EXPRESSION_BY_ID.get('neutre')!
  const rond = roundifyExpression(neutre, 0.38)
  assert.equal(rond.id, neutre.id)
  assert.deepEqual(rond.gaze, neutre.gaze)
  assert.equal(rond.split, neutre.split)
  for (const eye of rond.eyes) {
    assert.equal(eye.w, 0.38)
    assert.equal(eye.h, 0.38)
    assert.equal(eye.tilt, 0)
  }
  // la paupiere du somnolent survit : c'est `open`, pas la forme
  const somnolent = roundifyExpression(EXPRESSION_BY_ID.get('somnolent')!, 0.38)
  assert.equal(somnolent.eyes[0]!.open, 0.42)
  // l'expression d'origine n'est pas touchee
  assert.equal(neutre.eyes[0]!.w, 0.186)
})

test('pupilSize : une fraction du petit cote, pour fondre au clignement', () => {
  const proche = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ~ ${b}`)
  // oeil rond de 38 : pupille ~16
  proche(pupilSize({ w: 38, h: 38 }), 15.96)
  // capsule d'origine (18,6 x 41,2) : la LARGEUR commande
  proche(pupilSize({ w: 18.6, h: 41.2 }), 7.812)
  // oeil plisse : la HAUTEUR commande, pas la largeur
  proche(pupilSize({ w: 34, h: 13 }), 5.46)
})

test('l\'antenne part du sommet et monte, sans jamais descendre dessous', () => {
  const top = { x: 0, y: -100 }
  for (const style of ['rod', 'curl'] as const) {
    for (const t of [0, 0.7, 1.9, 3.4]) {
      const rig = antennaRig(top, style, t, 0, 30)
      assert.ok(rig.tip.y < top.y, `${style}@${t}: le bout doit rester au-dessus de l'ancre`)
      assert.ok(Math.abs(rig.tip.x) < 30 * 0.3, `${style}@${t}: le balancement ne part pas en vrille`)
      assert.ok(rig.d.startsWith('M0 -100'))
      assert.equal(rig.ballR, 4.8)
    }
  }
})

test('l\'antenne respire : meme ancre, dates differentes, tiges differentes', () => {
  const top = { x: 0, y: -100 }
  const a = antennaRig(top, 'rod', 0, 0, 30)
  const b = antennaRig(top, 'rod', 1.3, 0, 30)
  assert.notEqual(a.d, b.d)
  // deterministe : relire la meme date redonne la meme tige
  assert.deepEqual(antennaRig(top, 'rod', 1.3, 0, 30), b)
  // serpentin != tige droite des que le balancement vit (a t = 0, les deux sont droits)
  assert.notEqual(antennaRig(top, 'curl', 1.3, 0, 30).d, b.d)
})

test('blush : sous l\'oeil, pousse vers l\'exterieur', () => {
  const R = 100
  // un oeil a droite du centre (e > 0) : la joue part encore plus a droite
  const droite = blushAttrs(
    { d: '', matrix: 'matrix(1,0,0,1,15.46,-4)', alpha: 1, w: 38, h: 38 },
    R
  )
  assert.equal(droite.cx, 37.46)
  assert.equal(droite.cy, 30)
  assert.equal(droite.rx, 10.5)
  // oeil a gauche : la joue part a gauche
  const gauche = blushAttrs(
    { d: '', matrix: 'matrix(1,0,0,1,-15.46,-4)', alpha: 1, w: 38, h: 38 },
    R
  )
  assert.equal(gauche.cx, -37.46)
})

test('le moteur expose le sommet du corps et la taille des yeux', () => {
  const engine = new BotEngine(100, 'idle', null, null)
  const frame = engine.sample(0.5)
  // cercle de rayon 100 au repos : sommet juste au-dessus de -100
  // (respiration a +-0,5 %, derive de quelques dixiemes)
  assert.ok(frame.top.y < -98 && frame.top.y > -102, `top.y = ${frame.top.y}`)
  assert.ok(Math.abs(frame.top.x) < 3, `top.x = ${frame.top.x}`)
  // les yeux portent leurs dimensions locales : capsule 18,6 x 41,2 a l'echelle 100
  assert.equal(frame.eyes.length, 2)
  for (const eye of frame.eyes) {
    assert.ok(Math.abs(eye.w - 18.6) < 1e-9)
    assert.ok(Math.abs(eye.h - 41.2) < 1e-9)
  }
})

test('GOO_EYES : cinq teintes partagees, toutes completes et distinctes', () => {
  const fills = new Set<string>()
  for (const [id, eye] of Object.entries(GOO_EYES)) {
    assert.ok(eye.fill.startsWith('#'), `${id} : fill invalide : ${eye.fill}`)
    // le nuit est la couleur PLEINE de la liste ; les autres degradent
    if (id !== 'nuit') assert.ok(eye.fill2?.startsWith('#'), `${id} : le degrade exige fill2`)
    fills.add(eye.fill)
  }
  assert.equal(fills.size, 5, 'les teintes doivent etre distinctes')
  assert.equal(GOO_EYES.nuit?.fill, '#17171c', 'le nuit est l\'oeil sombre de la liste')
})

test('eyeDecor : les reflets restent DANS l oeil, le coeur est plus petit', () => {
  // (cx/(rx-r))^2 + (cy/(ry-r))^2 <= 1 : le cercle de rayon r est dans l'ellipse
  const dansLOeil = (w: number, h: number, hi: { cx: number; cy: number; r: number }) => {
    const rx = w / 2
    const ry = h / 2
    const ex = Math.max(rx - hi.r, 1e-9)
    const ey = Math.max(ry - hi.r, 1e-9)
    return (hi.cx / ex) ** 2 + (hi.cy / ey) ** 2
  }
  for (const [w, h] of [
    [46, 46], // oeil rond Ø0,46
    [52, 52], // grand oeil Ø0,52
    [18.6, 41.2], // capsule d'origine
    [46, 3] // oeil en pleine fermeture (clignement)
  ] as const) {
    const d = eyeDecor({ w, h })
    assert.ok(d.coreR > 0 && d.coreR <= Math.min(w, h) / 2, `coeur hors de l'oeil : ${d.coreR}`)
    assert.ok(dansLOeil(w, h, d.hi1) <= 1, `grand reflet sort de l'oeil ${w}x${h}`)
    assert.ok(dansLOeil(w, h, d.hi2) <= 1, `petit reflet sort de l'oeil ${w}x${h}`)
  }
})
