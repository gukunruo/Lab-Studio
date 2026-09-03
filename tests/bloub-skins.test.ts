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

test('fantome : dome haut comme la boule, jupe dentee en dessous', () => {
  const fantome = SHAPE_BY_ID.get('fantome')
  assert.ok(fantome, 'fantome doit etre une forme du personnalisateur')
  assert.equal(fantome.radii.length, PROFILE_SAMPLES)
  for (const r of fantome.radii) assert.ok(Number.isFinite(r) && r > 0, `rayon invalide : ${r}`)
  // le dome tient a peu pres dans la boule d'origine
  const dome = radiusAtAngle(fantome.radii, -Math.PI / 2)
  assert.ok(dome > 0.94 && dome < 1.03, `dome = ${dome}`)
  // la jupe ondule : des rayons profonds ET des creux sur la moitie basse
  const jupe: number[] = []
  for (let i = 0; i < 24; i++) jupe.push(radiusAtAngle(fantome.radii, Math.PI / 4 + (i / 24) * (Math.PI / 2)))
  assert.ok(Math.max(...jupe) > 0.16, `jupe trop plate : max ${Math.max(...jupe)}`)
  assert.ok(Math.min(...jupe) < Math.max(...jupe) * 0.5, 'la jupe doit avoir des creux (dents de scie)')
})

test('le catalogue compte dix formes, toutes uniques', () => {
  assert.equal(SHAPES.length, 10)
  assert.equal(new Set(SHAPES.map((s) => s.id)).size, 10)
})
