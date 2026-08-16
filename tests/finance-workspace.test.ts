import test from 'node:test'
import assert from 'node:assert/strict'
import {
  INDEX_STRIP_HEIGHT,
  MA_MENU_PORTAL_TARGET,
  nextAiPanelState,
  nextMaMenuState,
  workspaceGridTemplate,
} from '../src/apps/finance/useFinance'
import {
  createBoardPageState,
  heatmapAvailability,
  heatmapFlexWeights,
} from '../src/apps/finance/boards'

test('index strip reserves a readable card height', () => {
  assert.equal(INDEX_STRIP_HEIGHT, 64)
})

test('MA more menu toggles open and closed from a button click', () => {
  assert.equal(nextMaMenuState(false), true)
  assert.equal(nextMaMenuState(true), false)
})

test('MA more menu renders outside the horizontal toolbar overflow', () => {
  assert.equal(MA_MENU_PORTAL_TARGET, 'body')
})

test('AI panel toggle keeps the panel open or closed explicitly', () => {
  assert.equal(nextAiPanelState(true), false)
  assert.equal(nextAiPanelState(false), true)
})


test('fullscreen workspace keeps the center and AI columns together', () => {
  assert.equal(
    workspaceGridTemplate(360),
    'minmax(0, 1fr) 12px 360px',
  )
})

test('board page state accepts the heatmap view query', () => {
  assert.equal(
    createBoardPageState({ kind: 'industry', order: 'up', view: 'heatmap' }).view,
    'heatmap',
  )
})

test('heatmap flex weights require real positive sourced weights', () => {
  assert.deepEqual(
    heatmapFlexWeights([
      { weight: 75, weightProvider: 'provider', weightSource: 'source' },
      { weight: 25, weightProvider: 'provider', weightSource: 'source' },
    ]),
    [0.75, 0.25],
  )
  assert.deepEqual(
    heatmapFlexWeights([{ weight: 75 }]),
    [],
  )
  assert.equal(
    heatmapAvailability([{ weight: 0, weightProvider: 'provider', weightSource: 'source' }]).available,
    false,
  )
})
