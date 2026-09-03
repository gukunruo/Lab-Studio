import test from 'node:test'
import assert from 'node:assert/strict'
import { lookTarget, PITCH_MAX, SPIN, YAW_MAX } from '../src/ui/gaze'

// La cible de regard doit suivre le curseur dans TOUTES les directions —
// c'est la regle que deux signes trompent facilement, et celle que le biais
// historique « regarde a gauche » a masquee. Convention de `face.ts` : lacet
// positif = regarde a droite, tangage positif = regarde en haut, alors que le
// y de l'ecran descend.

test('le regard suit le curseur a droite comme a gauche, sans biais', () => {
  const droite = lookTarget({ nx: 1, ny: 0, tour: 1, pointer: true })
  const gauche = lookTarget({ nx: -1, ny: 0, tour: 1, pointer: true })
  assert.equal(droite.yaw, YAW_MAX)
  assert.equal(gauche.yaw, -YAW_MAX)
  // symetrie : aucun cote privilegie
  assert.equal(droite.yaw, -gauche.yaw)
})

test('curseur au centre : regard droit devant', () => {
  const look = lookTarget({ nx: 0, ny: 0, tour: 1, pointer: true })
  assert.equal(look.yaw, 0)
  // `-ny` produit -0 quand ny vaut 0 : meme valeur pour le moteur, on compare en absolu
  assert.equal(Math.abs(look.pitch), 0)
})

test('le tangage suit le curseur verticalement (y ecran descendant)', () => {
  const bas = lookTarget({ nx: 0, ny: 1, tour: 1, pointer: true })
  const haut = lookTarget({ nx: 0, ny: -1, tour: 1, pointer: true })
  assert.equal(bas.pitch, -PITCH_MAX)
  assert.equal(haut.pitch, PITCH_MAX)
})

test('sans pointeur la derive revient, avec pointeur le regard est verrouille', () => {
  assert.equal(lookTarget({ nx: 0, ny: 0, tour: 1, pointer: true }).wander, 0)
  assert.equal(lookTarget({ nx: 0, ny: 0, tour: 1, pointer: false }).wander, 1)
})

test('tour mene mix et spin en miroir', () => {
  const depart = lookTarget({ nx: 0, ny: 0, tour: 0, pointer: true })
  const arrivee = lookTarget({ nx: 0, ny: 0, tour: 1, pointer: true })
  assert.equal(depart.mix, 0)
  assert.equal(depart.spin, SPIN)
  assert.equal(arrivee.mix, 1)
  assert.equal(arrivee.spin, 0)
})
