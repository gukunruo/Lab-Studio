import test from 'node:test'
import assert from 'node:assert/strict'
import { SHAPES, SHAPE_BY_ID, type BotShape } from '../src/bot/skins'
import { PROFILE_SAMPLES } from '../src/bot/profiles'
import { radiusAtAngle } from '../src/bot/shape'

// Les formes du personnalisateur : chaque silhouette doit etre un profil radial
// complet. Le gelee a ete rejete en revue (silhouette sans caractere), la flamme
// retiree du projet (trace fidele au emoji mais sans le charme du rendu) — le
// catalogue ne garde que les formes qui ont passe l'epreuve du rendu.

/** Chaque forme declaree : profil plein, finis, sans accesoire mort. */
const probeForme = (forme: BotShape | undefined, id: string) => {
  assert.ok(forme, `${id} doit etre une forme du personnalisateur`)
  assert.equal(forme!.radii.length, PROFILE_SAMPLES)
  for (const r of forme!.radii) assert.ok(Number.isFinite(r) && r > 0, `rayon invalide : ${r}`)
}

test('pudding : etroit en haut, large en bas, profil complet', () => {
  probeForme(SHAPE_BY_ID.get('pudding'), 'pudding')
  const pudding = SHAPE_BY_ID.get('pudding')!
  const top = radiusAtAngle(pudding.radii, -Math.PI / 2)
  const bottom = radiusAtAngle(pudding.radii, Math.PI / 2)
  assert.ok(top < bottom * 0.8, `dessus ${top} doit etre nettement plus etroit que dessous ${bottom}`)
})

test('le gelee est raye du catalogue', () => {
  assert.equal(SHAPE_BY_ID.get('gelee'), undefined, 'le gelee a ete rejete en revue')
  assert.ok(!SHAPES.some((s) => s.id === 'gelee'))
  // plus d'accesoires de forme : ni onde de jupe, ni reflets, ni suggestions
  assert.ok(!SHAPES.some((s) => 'skirt' in s), 'plus d\'onde de jupe')
  assert.ok(!SHAPES.some((s) => 'gloss' in s), 'plus de reflets portes par la forme')
  assert.ok(!SHAPES.some((s) => 'eye' in s), 'plus d\'oeil suggere par la forme')
  assert.ok(!SHAPES.some((s) => 'blush' in s), 'plus de joues suggerees par la forme')
})

test('le catalogue compte dix formes, toutes uniques', () => {
  assert.equal(SHAPES.length, 10)
  assert.equal(new Set(SHAPES.map((s) => s.id)).size, 10)
})

test('l\'etincelle est au catalogue, et elle scintille', () => {
  const spark = SHAPE_BY_ID.get('etincelle')
  assert.ok(spark, 'l\'etincelle doit etre une forme du personnalisateur')
  probeForme(spark, 'etincelle')
  // son onde de scintillement voyage avec elle
  assert.ok(spark!.wave, 'l\'etincelle doit porter son onde')
  // depuis le retrait de la flamme, elle est la seule forme animee du catalogue
  assert.equal(SHAPES.filter((s) => s.wave).length, 1, 'une seule forme animee')
})
