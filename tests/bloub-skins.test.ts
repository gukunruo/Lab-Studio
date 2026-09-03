import test from 'node:test'
import assert from 'node:assert/strict'
import { SHAPES, SHAPE_BY_ID } from '../src/bot/skins'
import { PROFILE_SAMPLES } from '../src/bot/profiles'
import { radiusAtAngle } from '../src/bot/shape'

// Les formes du personnalisateur : chaque silhouette doit etre un profil radial
// complet, et les deux silhouettes venues du labo Goo (le pudding, le fantome)
// gardent leur caractere une fois promues formes a part entiere.

test('pudding : etroit en haut, large en bas, profil complet', () => {
  const pudding = SHAPE_BY_ID.get('pudding')
  assert.ok(pudding, 'pudding doit etre une forme du personnalisateur')
  assert.equal(pudding.radii.length, PROFILE_SAMPLES)
  for (const r of pudding.radii) assert.ok(Number.isFinite(r) && r > 0, `rayon invalide : ${r}`)
  const top = radiusAtAngle(pudding.radii, -Math.PI / 2)
  const bottom = radiusAtAngle(pudding.radii, Math.PI / 2)
  assert.ok(top < bottom * 0.8, `dessus ${top} doit etre nettement plus etroit que dessous ${bottom}`)
})

test('fantome : plus grand que large, jupe a festons profonds', () => {
  const fantome = SHAPE_BY_ID.get('fantome')
  assert.ok(fantome, 'fantome doit etre une forme du personnalisateur')
  assert.equal(fantome.radii.length, PROFILE_SAMPLES)
  for (const r of fantome.radii) assert.ok(Number.isFinite(r) && r > 0, `rayon invalide : ${r}`)
  // la hauteur (dome + jupe) depasse nettement la largeur : un fantome trapu
  // ressemble a un champignon, pas a un spectre
  const up = radiusAtAngle(fantome.radii, -Math.PI / 2)
  const down = radiusAtAngle(fantome.radii, Math.PI / 2)
  const left = radiusAtAngle(fantome.radii, Math.PI)
  const right = radiusAtAngle(fantome.radii, 0)
  assert.ok(up + down > (left + right) * 1.15, `hauteur ${up + down} vs largeur ${left + right}`)
  // la jupe ondule en festons larges et profonds (pas des dents de scie plates)
  const jupe: number[] = []
  for (let i = 0; i < 24; i++) jupe.push(radiusAtAngle(fantome.radii, Math.PI / 4 + (i / 24) * (Math.PI / 2)))
  assert.ok(Math.min(...jupe) > 0.5, `jupe enfoncee : min ${Math.min(...jupe)}`)
  assert.ok(Math.max(...jupe) > Math.min(...jupe) * 1.2, `festons trop plats : ${Math.min(...jupe)} -> ${Math.max(...jupe)}`)
})

test('le catalogue compte dix formes, toutes uniques', () => {
  assert.equal(SHAPES.length, 10)
  assert.equal(new Set(SHAPES.map((s) => s.id)).size, 10)
})
