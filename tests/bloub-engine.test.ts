import test from 'node:test'
import assert from 'node:assert/strict'
import {
  BotEngine,
} from '../src/bot/engine'
import { skirtWave } from '../src/bot/shape'
import { SHAPE_BY_ID } from '../src/bot/skins'
import { EXPRESSION_BY_ID } from '../src/bot/expressions'

// The engine is a pure function of time : sample(t) must be rejouable and
// setters must morph rather than jump. These invariants are the ones an
// export / freeze-frame / state-board flow depends on.

test('sample is deterministic: the same time yields the same frame', () => {
  const e = new BotEngine(100, 'orbit')
  const a = e.sample(1.2)
  const b = e.sample(1.2)
  assert.equal(a.bodyPath, b.bodyPath)
  assert.deepEqual(a.eyes, b.eyes)
  assert.deepEqual(a.dots, b.dots)
  assert.deepEqual(a.arcs, b.arcs)
})

test('a frozen frame is reproducible across engine instances', () => {
  const a = new BotEngine(100, 'orbit')
  const b = new BotEngine(100, 'orbit')
  assert.deepEqual(a.sample(1.2), b.sample(1.2))
})

test('setState drives a morph between endpoints, not a jump', () => {
  const e = new BotEngine(100, 'idle')
  const settledIdle = e.sample(10)

  e.setState('orbit', 10)
  const start = e.sample(10) // morph ratio 0 -> still idle
  const mid = e.sample(10.3) // intermediate
  const settled = e.sample(10.6) // orbit morph = 0.6, settled at 1

  assert.equal(start.bodyPath, settledIdle.bodyPath, 'no jump at the instant of setState')
  assert.notEqual(mid.bodyPath, start.bodyPath, 'mid-morph is progressing')
  assert.notEqual(settled.bodyPath, start.bodyPath, 'settled frame differs from the origin')
  assert.notEqual(settled.bodyPath, mid.bodyPath, 'settled frame differs from a mid frame')
})

test('setShape morphs toward the target instead of jumping', () => {
  const cercle = SHAPE_BY_ID.get('cercle')!.radii
  const galet = SHAPE_BY_ID.get('galet')!.radii
  assert.notDeepEqual(cercle, galet)

  const e = new BotEngine(100, 'idle')
  e.setShape(cercle, 0)
  const before = e.sample(10)
  e.setShape(galet, 10)
  const start = e.sample(10) // ratio 0 -> still cercle
  const settled = e.sample(10 + BotEngine.SHAPE_MORPH) // ratio 1 -> galet

  assert.equal(start.bodyPath, before.bodyPath, 'no jump at the instant of setShape')
  assert.notEqual(settled.bodyPath, start.bodyPath, 'the morph moves the silhouette')

  // convergence : after the morph the body is the target shape, same as an
  // engine that started directly on it.
  const direct = new BotEngine(100, 'idle')
  direct.setShape(galet, 0)
  assert.equal(settled.bodyPath, direct.sample(10 + BotEngine.SHAPE_MORPH).bodyPath)

  // the body stays the target shape later, too (no echo of the origin). Life
  // overlay (breath/drift) varies with time, so compare both engines at the
  // SAME later instant — that keeps the assertion about shape, not breathing.
  const later = 10 + BotEngine.SHAPE_MORPH + 1
  assert.equal(e.sample(later).bodyPath, direct.sample(later).bodyPath)
})

test('setExpression morphs instead of jumping', () => {
  const neutre = EXPRESSION_BY_ID.get('neutre')!
  const heureux = EXPRESSION_BY_ID.get('heureux')!
  assert.notEqual(neutre.id, heureux.id)

  const e = new BotEngine(100, 'idle')
  e.setExpression(neutre, 0)
  const before = e.sample(10)
  e.setExpression(heureux, 10)
  const start = e.sample(10) // ratio 0 -> still neutre
  const settled = e.sample(10 + BotEngine.SHAPE_MORPH) // ratio 1 -> heureux

  assert.deepEqual(start.eyes, before.eyes, 'no jump at the instant of setExpression')
  assert.notDeepEqual(settled.eyes, before.eyes, 'the morph changes the rendered eyes')

  const direct = new BotEngine(100, 'idle', null, heureux)
  assert.deepEqual(settled.eyes, direct.sample(10 + BotEngine.SHAPE_MORPH).eyes)
})

test('reset clears history so the first frame is a pure pose', () => {
  const e = new BotEngine(100, 'idle')
  e.setState('orbit', 10)
  e.sample(11)
  e.setState('idle', 20)
  e.sample(21)
  e.reset('orbit', 30)

  // Same start time, same state -> identical frame. If reset had failed to
  // clear `prev`, the sample would blend the last-quit state and diverge.
  const fresh = new BotEngine(100, 'orbit')
  fresh.reset('orbit', 30)
  assert.deepEqual(e.sample(30.5), fresh.sample(30.5))
})

/* ---------------------------------------------------- la jupe ondulante */

test('skirtWave : une onde pure, intacte hors bande, vivante au fond', () => {
  const base = Array.from({ length: 64 }, (_, i) => 0.8 + (i % 8) * 0.02)
  const copie = [...base]
  const wave = { amp: 0.05, waves: 3, band: 1.0, period: 2.6 }

  const out = skirtWave(base, wave, 0)
  assert.notEqual(out, base, 'une liste NEUVE, jamais la meme')
  assert.deepEqual(base, copie, 'l\'entree n\'est pas mutee')

  // hors de la bande (angle 0 et PI : les flancs) : rayons intacts
  assert.equal(out[0], base[0])
  assert.equal(out[32], base[32])

  // au fond (index 16 = PI/2), l'onde respire avec le temps : pics a +/- amp
  const vals = [0, 0.65, 1.3, 1.95].map((t) => skirtWave(base, wave, t)[16]!)
  assert.ok(Math.max(...vals) - Math.min(...vals) > base[16]! * 0.05 * 0.9,
    `l'onde doit faire vivre le fond : ${Math.min(...vals)} -> ${Math.max(...vals)}`)

  // deterministe : relire la meme date redonne la meme jupe
  assert.deepEqual(skirtWave(base, wave, 1.3), skirtWave(base, wave, 1.3))
})

test('le moteur ondule la jupe du fantome, puis l\'eteint au morph vers une forme nue', () => {
  const nue = Array.from({ length: 64 }).fill(1) as number[]
  const onde = { amp: 0.2, waves: 2, band: Math.PI, period: 1 }

  // deux moteurs gemellaux : la derive et la respiration de `liveliness` sont
  // les memes aux memes dates, donc la difference isole l'onde
  const ondee = new BotEngine(100, 'idle', nue, null, onde)
  const nue2 = new BotEngine(100, 'idle', nue, null, null)
  const ecart = (e: BotEngine, a: number, b: number) => {
    const pa = e.sample(a).bodyPath.match(/-?[\d.]+/g)!.map(Number)
    const pb = e.sample(b).bodyPath.match(/-?[\d.]+/g)!.map(Number)
    return Math.max(...pa.map((v, i) => Math.abs(v - pb[i]!)))
  }

  // l'onde amplitude 0,2 sur tout le tour : bien plus que la derive seule
  const vivant = ecart(ondee, 10, 10.5)
  const fige = ecart(nue2, 10, 10.5)
  assert.ok(vivant > fige * 3 + 5, `onde ${vivant} vs derive seule ${fige}`)

  // on retire l'onde (memes rayons, jupe nulle) : apres le morph, plus de vie
  // supplementaire — le corps retombe sur la derive seule
  ondee.setShape(nue, 20, null)
  const apres = ecart(ondee, 22, 22.5)
  const fige2 = ecart(nue2, 22, 22.5)
  assert.ok(apres < fige2 * 1.5 + 1, `onde eteinte ${apres} vs derive ${fige2}`)
})
