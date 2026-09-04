import test from 'node:test'
import assert from 'node:assert/strict'
import { SHAPES, SHAPE_BY_ID } from '../src/bot/skins'
import { PROFILE_SAMPLES } from '../src/bot/profiles'
import { radiusAtAngle } from '../src/bot/shape'

// Les formes du personnalisateur : chaque silhouette doit etre un profil radial
// complet, et les deux silhouettes venues du labo Goo (le pudding, le gelee)
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

test('gelee : blob gras plus large que haut, fonte fondue, reflets et oeil sombre', () => {
  const gelee = SHAPE_BY_ID.get('gelee')
  assert.ok(gelee, 'gelee doit etre une forme du personnalisateur')
  assert.equal(gelee.radii.length, PROFILE_SAMPLES)
  for (const r of gelee.radii) assert.ok(Number.isFinite(r) && r > 0, `rayon invalide : ${r}`)
  // grand et pose : le dome du modele est HAUT (revue 2026-09 : encore trop
  // court), presque carre, mais jamais une colonne ni une galette
  const up = radiusAtAngle(gelee.radii, -Math.PI / 2)
  const down = radiusAtAngle(gelee.radii, Math.PI / 2)
  const left = radiusAtAngle(gelee.radii, Math.PI)
  const right = radiusAtAngle(gelee.radii, 0)
  const rapport = (up + down) / (left + right)
  assert.ok(rapport > 0.9 && rapport < 1.08, `h/w ${rapport.toFixed(2)} : un blob haut, pas une galette`)
  // la fonte : trois gouttes rondes — le fond remonte entre les gouttes mais
  // reste bas, et les pointes descendent nettement (pas une assiette plate)
  const fond: number[] = []
  for (let i = 0; i < 32; i++) fond.push(radiusAtAngle(gelee.radii, (i / 32) * Math.PI))
  assert.ok(Math.min(...fond) > 0.55, `fond trop creuse : min ${Math.min(...fond)}`)
  assert.ok(Math.max(...fond) > Math.min(...fond) * 1.15, `fonte trop plate : ${Math.min(...fond)} -> ${Math.max(...fond)}`)
  // l'onde : declaree sur le gelee seul, avec des parametres perceptibles
  assert.ok(gelee.skirt, 'le gelee doit porter une onde de jupe')
  const { amp, waves, band, period } = gelee.skirt!
  assert.ok(amp > 0.02 && amp < 0.1, `amplitude ${amp} : perceptible, pas caricaturale`)
  assert.ok(waves >= 2, `waves ${waves} : au moins deux cretes dans la bande`)
  assert.ok(band > 0.5, `bande ${band} : la jupe entiere, pas un feston seul`)
  assert.ok(period > 0.5, `periode ${period} : assez lente pour lire l'onde`)
  // la vitrine de visage a ete rejetee en revue : plus aucune forme n'en porte
  assert.ok(!SHAPES.some((s) => s.face), 'plus de vitrine de visage sur aucune forme')
  // reflets de matiere, oeil sombre suggere, joues corail
  assert.ok(gelee.gloss && gelee.gloss.length >= 2, 'le gelee porte ses reflets')
  assert.equal(gelee.eye?.fill, '#17171c', 'oeil sombre suggere par la forme')
  assert.ok(gelee.blush, 'joues corail suggerees par la forme')
  // les suggestions ne concernent que le gelee
  assert.equal(SHAPES.filter((s) => s.skirt).length, 1, 'seul le gelee ondule')
  assert.equal(SHAPES.filter((s) => s.eye).length, 1, 'seul le gelee suggere un oeil')
})

test('le catalogue compte dix formes, toutes uniques', () => {
  assert.equal(SHAPES.length, 10)
  assert.equal(new Set(SHAPES.map((s) => s.id)).size, 10)
})
