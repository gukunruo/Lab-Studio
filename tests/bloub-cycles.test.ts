import test from 'node:test'
import assert from 'node:assert/strict'
import {
  blocksWith,
  clampDuration,
  cycleFromJson,
  cycleToJson,
  defaultCycle,
  MAX_BLOCS,
  MAX_BLOCK,
  minDurationOf,
  moveBlock,
  removeBlock,
  STEP,
  type Block,
  type Cycle
} from '../src/bot/cycles'

// Les fonctions d'edition et de stockage du cycle sont des transformations pures :
// elles doivent rendre une nouvelle liste sans muter l'entree, se borner a des
// bornes fixes (un stockage hostile est modifiable a la main), et le cycle d'un
// utilisateur doit survivre a un aller-retour JSON sans perdre de duree.

const idle: Block = { state: 'idle', duration: 2.4 }
const wink: Block = { state: 'wink', duration: 1.6 }
const orbit: Block = { state: 'orbit', duration: 3.4 }

test('removeBlock returns a new list and does not mutate the input', () => {
  const input = [idle, wink, orbit]
  const next = removeBlock(input, 1)
  assert.deepEqual(next, [idle, orbit])
  assert.deepEqual(input, [idle, wink, orbit], 'input is left untouched')
})

test('removeBlock is a no-op on an out-of-range index', () => {
  assert.deepEqual(removeBlock([idle, wink], -1), [idle, wink])
  assert.deepEqual(removeBlock([idle, wink], 2), [idle, wink])
  assert.deepEqual(removeBlock([], 0), [])
})

test('blocksWith caps the montage at MAX_BLOCS', () => {
  const full: Block[] = Array.from({ length: MAX_BLOCS }, () => ({ ...idle }))
  assert.equal(blocksWith(full, 'wink').length, MAX_BLOCS)
})

test('moveBlock reorders and keeps the same blocks', () => {
  assert.deepEqual(moveBlock([idle, wink, orbit], 0, 2), [wink, orbit, idle])
  assert.deepEqual(moveBlock([idle, wink, orbit], 2, 0), [orbit, idle, wink])
  // les bornes sont clampees, pas rejetees
  assert.deepEqual(moveBlock([idle, wink], 0, 99), [wink, idle])
})

test('clampDuration bounds to [minDurationOf, MAX_BLOCK] and snaps to STEP', () => {
  const state = 'idle'
  const lo = minDurationOf(state)
  assert.ok(clampDuration(state, 0.01) >= lo, 'clamps up to the motor floor')
  assert.equal(clampDuration(state, 999), MAX_BLOCK, 'clamps down to MAX_BLOCK')
  for (const seconds of [0.03, 2.4, 2.47, 9.99]) {
    const snapped = clampDuration(state, seconds)
    assert.ok(snapped >= lo && snapped <= MAX_BLOCK, 'stays within bounds')
    assert.ok(Math.abs(snapped * 10 - Math.round(snapped * 10)) < 1e-9, 'is a multiple of STEP')
  }
})

test('a cycle survives a JSON round-trip without losing duration', () => {
  const cycle = defaultCycle()
  const raw = cycleToJson(cycle)
  const back = cycleFromJson(raw)
  assert.ok(back, 'round-trip yields a cycle')
  assert.equal(back!.id, cycle.id)
  assert.equal(back!.name, cycle.name)
  assert.deepEqual(back!.blocks, cycle.blocks)
})

test('cycleFromJson rejects hostile or malformed input', () => {
  assert.equal(cycleFromJson(null), null)
  assert.equal(cycleFromJson(''), null)
  assert.equal(cycleFromJson('{'), null)
  assert.equal(cycleFromJson('"hello"'), null)
  assert.equal(cycleFromJson('42'), null)
  assert.equal(cycleFromJson('[{"id":"c1","name":"x","blocks":[]}]'), null, 'empty blocks rejected')
  // un etat hors catalogue est jete, comme dans parseCycles
  const hostile = cycleToJson({
    id: 'defaut',
    name: '',
    blocks: [{ state: 'swirl' as Block['state'], duration: 1 }]
  })
  assert.equal(cycleFromJson(hostile), null, 'swirl is out of SEQUENCE')
})

test('a custom sequence reloads with clamped durations', () => {
  const raw = cycleToJson({ id: 'defaut', name: '', blocks: [{ ...idle, duration: 999 }] })
  const back = cycleFromJson(raw)
  assert.ok(back)
  assert.equal(back!.blocks[0]!.duration, MAX_BLOCK)
})
