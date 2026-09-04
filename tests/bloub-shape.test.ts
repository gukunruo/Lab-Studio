import test from 'node:test'
import assert from 'node:assert/strict'
import { PROFILE_SAMPLES } from '../src/bot/profiles'
import { sparkleProfile, waveRadii, type ShapeWave } from '../src/bot/shape'

// L'etincelle : une superformule de Gielis (m=4, n2=n3) evaluee DIRECTEMENT sur
// les 64 angles — analytique, donc lisse par construction, jamais un polygone
// replace a la main. Et son onde : une vibration stationnaire dont l'enveloppe
// culmine sur les pointes — les vallees restent, les pointes pulsent.

test('sparkleProfile : quatre pointes identiques sur les axes, vallees symetriques', () => {
  const radii = sparkleProfile(0.6, 1)
  assert.equal(radii.length, PROFILE_SAMPLES)
  // pointes aux indices 0, 16, 32, 48 — toutes egales
  for (const i of [0, 16, 32, 48]) {
    assert.ok(Math.abs(radii[i]! - radii[0]!) < 1e-9, `pointe ${i} egale a la premiere`)
  }
  // vallees aux indices 8, 24, 40, 56 — egales entre elles, plus courtes
  for (const i of [8, 24, 40, 56]) {
    assert.ok(Math.abs(radii[i]! - radii[8]!) < 1e-9, `vallee ${i} egale a la premiere`)
  }
  assert.ok(radii[8]! < radii[0]! * 0.9, 'les vallees doivent creuser')
  // rapport mesure sur la feuille de candidats : ~0.561 pour (n1=0.6, n=1)
  const ratio = radii[8]! / radii[0]!
  assert.ok(Math.abs(ratio - 0.5612) < 0.001, `rapport vallee/pointe = ${ratio}`)
})

const WAVE: ShapeWave = { amp: 0.05, period: 1.8, lobes: 4, focus: 2, phase: 0 }

test('waveRadii : les pointes pulsent, les vallees restent, pur et sans effet de bord', () => {
  const base = sparkleProfile(0.6, 1)
  const figee = [...base]
  const a = waveRadii(base, WAVE, 0)
  const b = waveRadii(base, WAVE, WAVE.period / 4)
  // l'entree n'est pas mutee
  assert.deepEqual(base, figee)
  // une pointe bouge visiblement entre quart de periode
  assert.ok(Math.abs(a[0]! - b[0]!) > 0.004, `pointe : ${a[0]} vs ${b[0]}`)
  // la vallee est IMMOBILE : focus 2 annule l'enveloppe a 45deg exact
  assert.ok(Math.abs(a[8]! - b[8]!) < 1e-12, `vallee : ${a[8]} vs ${b[8]}`)
  // deterministe : relire la meme date redonne les memes rayons
  assert.deepEqual(waveRadii(base, WAVE, 0.7), waveRadii(base, WAVE, 0.7))
  // amplitude nulle : identite exacte
  assert.deepEqual(waveRadii(base, WAVE, 0.3, 0), base)
})
