import { expect, test } from '@playwright/test'
import {
  enterSourceMode,
  exitSourceMode,
  expectNoRendererErrors,
  getMarkdownContent,
  launchWithMarkdown,
  setSourceMarkdown
} from './helpers'

test('game directives render inert cards, isolate play and survive source mode', async() => {
  test.setTimeout(60000)
  const original =
    '# Games\n\n::game 2048\n\n::game sudoku\n\n::game tetris\n\n```text\n::game racer\n```\n\n`::game q1k3`\n'
  const { app, page } = await launchWithMarkdown(original, { suppressErrorDialog: true })
  try {
    await expect(page.locator('.inline-game-card')).toHaveCount(3)
    await expect(page.locator('iframe')).toHaveCount(0)
    const before = await getMarkdownContent(page, app)
    const merge = page.locator('.mu-game-preview[data-game="2048"]')
    await merge.getByRole('button', { name: '开始游戏' }).click()
    await expect(merge.locator('.arcade-merge button')).toHaveCount(16)
    await page.keyboard.press('ArrowRight')
    await page.screenshot({ path: '../../.tools/markdown-2048.png' })
    expect(await getMarkdownContent(page, app)).toBe(before)
    await page.keyboard.press('Escape')
    await expect(merge.getByRole('button', { name: '开始游戏' })).toBeVisible()

    const sudoku = page.locator('.mu-game-preview[data-game="sudoku"]')
    await sudoku.getByRole('button', { name: '开始游戏' }).click()
    const answer = await page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem('yarktext.arcade.v1') || '{}').sessions.sudoku
        .state
      const index = state.board.indexOf(0)
      return { index, value: state.solution[index] }
    })
    await sudoku.locator('.arcade-sudoku button').nth(answer.index).click()
    await page.keyboard.press(String(answer.value))
    await expect(sudoku.locator('.arcade-sudoku button').nth(answer.index)).toHaveText(
      String(answer.value)
    )
    await page.screenshot({ path: '../../.tools/markdown-sudoku.png' })
    expect(await getMarkdownContent(page, app)).toBe(before)
    await page.keyboard.press('Escape')

    const tiny = page.locator('.mu-game-preview[data-game="tetris"]')
    await tiny.getByRole('button', { name: '开始游戏' }).click()
    const frame = page.frameLocator('iframe[title="Tetris"]')
    await expect(frame.getByRole('button', { name: '开始游戏', exact: true })).toBeVisible()
    await expect(frame.locator('body')).toContainText('俄罗斯方块')
    await frame.getByRole('button', { name: '开始游戏', exact: true }).click()
    await expect(tiny.getByRole('alert')).toHaveCount(0)
    await enterSourceMode(page, app)
    await expect(page.locator('iframe')).toHaveCount(0)
    expect(await getMarkdownContent(page, app)).toBe(before)
    await exitSourceMode(page, app)
    await expect(page.locator('.inline-game-card')).toHaveCount(3)
    await setSourceMarkdown(page, app, before.replace('::game sudoku', '::game unknown'))
    await expect(page.locator('.mu-game-preview[data-game="unknown"]')).toContainText('未知游戏')
    await expect(page.locator('iframe')).toHaveCount(0)
    await expectNoRendererErrors(app)
  } finally {
    await app.evaluate(({ BrowserWindow }) => {
      for (const window of BrowserWindow.getAllWindows()) window.destroy()
    })
    await app.close()
  }
})

test('typing and editing a game directive updates its preview and permits inline 3D play', async() => {
  const { app, page } = await launchWithMarkdown('# Live games\n\nType here\n', {
    suppressErrorDialog: true
  })
  try {
    const line = page.locator('.mu-paragraph-content').filter({ hasText: 'Type here' })
    await line.fill('::game 2048')
    await expect(page.locator('.mu-game-preview[data-game="2048"]')).toContainText('开始游戏')
    const source = page.locator('.mu-game-block > .mu-paragraph-content')
    await source.fill('::game q1k3')
    await expect(page.locator('.mu-game-preview[data-game="2048"]')).toHaveCount(0)
    const game = page.locator('.mu-game-preview[data-game="q1k3"]')
    await game.getByRole('button', { name: '开始游戏' }).click()
    const frame = page.frameLocator('iframe[title="Q1K3"]')
    await expect(frame.locator('#ts')).toContainText('点击开始游戏')
    await frame.locator('#g').click()
    await expect(game.getByRole('status')).toContainText('鼠标已锁定')
    await page.keyboard.press('Control+Alt+g')
    await expect(page.locator('iframe')).toHaveCount(0)
    await expect(game.getByRole('button', { name: '开始游戏' })).toBeVisible()
    expect(await getMarkdownContent(page, app)).toContain('::game q1k3')
    await expectNoRendererErrors(app)
  } finally {
    await app.evaluate(({ BrowserWindow }) => {
      for (const window of BrowserWindow.getAllWindows()) window.destroy()
    })
    await app.close()
  }
})
