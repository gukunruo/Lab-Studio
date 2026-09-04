import test from 'node:test'
import assert from 'node:assert/strict'
import {
  BotEngine,
} from '../src/bot/engine'
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

test('the spark wave animates the body and sample stays replayable', () => {
  const spark = SHAPE_BY_ID.get('etincelle')!
  assert.ok(spark.wave)
  const e = new BotEngine(100, 'idle', spark.radii, null, spark.wave!)
  const a = e.sample(0)
  const b = e.sample(spark.wave!.period / 4)
  assert.notEqual(a.bodyPath, b.bodyPath, 'the wave moves the silhouette')
  assert.equal(e.sample(0).bodyPath, a.bodyPath, 'sample stays a pure function of time')
})

test('the wave dies out when returning to a waveless shape', () => {
  const cercle = SHAPE_BY_ID.get('cercle')!
  const spark = SHAPE_BY_ID.get('etincelle')!
  const e = new BotEngine(100, 'idle', cercle.radii, null)
  const plain = new BotEngine(100, 'idle', cercle.radii, null)
  e.setShape(spark.radii, 0, spark.wave!)
  e.sample(1)
  e.setShape(cercle.radii, 2)
  // long after the second morph, the waved engine must coincide exactly with
  // an engine that never left the circle — the wave must leave no echo.
  const later = 2 + BotEngine.SHAPE_MORPH + 1
  assert.equal(e.sample(later).bodyPath, plain.sample(later).bodyPath)
})

