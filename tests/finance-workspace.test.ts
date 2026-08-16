import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  COLLAPSED_RIGHT,
  INDEX_STRIP_HEIGHT,
  MA_MENU_PORTAL_TARGET,
  nextAiPanelState,
  nextMaMenuState,
  nextRightCollapsedState,
  financeGridTemplate,
  workspaceGridTemplate,
} from '../src/apps/finance/useFinance'
import {
  createBoardPageState,
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


test('fullscreen workspace only reserves the AI column when expanded', () => {
  assert.equal(workspaceGridTemplate(360, false), 'minmax(0, 1fr) 12px 360px')
  assert.equal(workspaceGridTemplate(360, true), 'minmax(0, 1fr)')
})

test('right workspace collapses to an accessible rail without changing the center minimum', () => {
  assert.equal(COLLAPSED_RIGHT, 48)
  assert.equal(nextRightCollapsedState(false), true)
  assert.equal(nextRightCollapsedState(true), false)
  assert.equal(
    financeGridTemplate(false, 210, 360, true),
    '210px 12px minmax(520px, 1fr) 12px 48px',
  )
  assert.equal(
    financeGridTemplate(true, 210, 360, true),
    '96px 12px minmax(520px, 1fr) 12px 48px',
  )
})

test('fullscreen workspace no longer reserves a collapsed right rail', () => {
  assert.equal(workspaceGridTemplate(COLLAPSED_RIGHT, true), 'minmax(0, 1fr)')
})

test('right collapse control is part of the workspace top tool area, not an absolute content overlay', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/apps/finance/index.vue'), 'utf8')
  const navStart = source.indexOf('<nav class="fin__workspace-tabs"')
  const navEnd = source.indexOf('</nav>', navStart)
  const collapseStart = source.indexOf('class="fin__right-collapse"')
  assert.ok(navStart >= 0)
  assert.ok(collapseStart > navStart && collapseStart < navEnd)
  assert.doesNotMatch(source.slice(source.indexOf('.fin__right-collapse {'), source.indexOf('.fin__right-collapse:hover')), /position:\s*absolute/)
})


test('board page state always normalizes legacy view queries to heatmap', () => {
  assert.equal(
    createBoardPageState({ kind: 'industry', order: 'up', view: 'list' }).view,
    'heatmap',
  )
  assert.equal(
    createBoardPageState({ kind: 'industry', order: 'up', view: 'heatmap' }).view,
    'heatmap',
  )
})
