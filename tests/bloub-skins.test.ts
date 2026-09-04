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

test('fantome : cloche de meduse, jupe a festons, onde de jupe declaree', () => {
  const fantome = SHAPE_BY_ID.get('fantome')
  assert.ok(fantome, 'fantome doit etre une forme du personnalisateur')
  assert.equal(fantome.radii.length, PROFILE_SAMPLES)
  for (const r of fantome.radii) assert.ok(Number.isFinite(r) && r > 0, `rayon invalide : ${r}`)
  // ni galette (v1, ~0.6) ni ampoule (v2, ~1.2) : une cloche de meduse tombe
  // entre les deux, dome haut et jupe etalee
  const up = radiusAtAngle(fantome.radii, -Math.PI / 2)
  const down = radiusAtAngle(fantome.radii, Math.PI / 2)
  const left = radiusAtAngle(fantome.radii, Math.PI)
  const right = radiusAtAngle(fantome.radii, 0)
  const rapport = (up + down) / (left + right)
  assert.ok(rapport > 0.8 && rapport < 1.15, `h/w ${rapport.toFixed(2)} : ni galette ni ampoule`)
  // la jupe ondule en festons larges et profonds (pas des dents de scie plates)
  const jupe: number[] = []
  for (let i = 0; i < 24; i++) jupe.push(radiusAtAngle(fantome.radii, Math.PI / 4 + (i / 24) * (Math.PI / 2)))
  assert.ok(Math.min(...jupe) > 0.5, `jupe enfoncee : min ${Math.min(...jupe)}`)
  assert.ok(Math.max(...jupe) > Math.min(...jupe) * 1.2, `festons trop plats : ${Math.min(...jupe)} -> ${Math.max(...jupe)}`)
  // l'onde : declaree sur le fantome seul, avec des parametres perceptibles
  assert.ok(fantome.skirt, 'le fantome doit porter une onde de jupe')
  const { amp, waves, band, period } = fantome.skirt!
  assert.ok(amp > 0.02 && amp < 0.1, `amplitude ${amp} : perceptible, pas caricaturale`)
  assert.ok(waves >= 2, `waves ${waves} : au moins deux cretes dans la bande`)
  assert.ok(band > 0.5, `bande ${band} : la jupe entiere, pas un feston seul`)
  assert.ok(period > 0.5, `periode ${period} : assez lente pour lire l'onde`)
  assert.equal(SHAPES.filter((s) => s.skirt).length, 1, 'seul le fantome ondule')
})

test('le catalogue compte dix formes, toutes uniques', () => {
  assert.equal(SHAPES.length, 10)
  assert.equal(new Set(SHAPES.map((s) => s.id)).size, 10)
})
