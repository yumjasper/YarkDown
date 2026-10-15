import { expect, test } from '@playwright/test'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type CodeMirror from 'codemirror'
import { enterSourceMode, expectNoRendererErrors, getMarkdownContent, launchWithDoc, launchWithMarkdown, placeCaretInEditor } from './helpers'

test('arcade scores, resume, source mode and quick hide never change the document', async() => {
  test.setTimeout(60000)
  const original = '# Arcade isolation\n\nKeep this paragraph unchanged.\n'
  const { app, page } = await launchWithMarkdown(original, { suppressErrorDialog: true })
  try {
    await expect(page.locator('.editor-component h1')).toContainText('Arcade isolation')
    const before = await getMarkdownContent(page, app)
    const dialog = page.getByRole('dialog', { name: '小憩', exact: true })
    await placeCaretInEditor(page)
    await page.keyboard.press('Control+Alt+g')
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('.arcade-merge button')).toHaveCount(16)
    await page.keyboard.press('ArrowRight')
    await expect(dialog.getByRole('button', { name: '新一局', exact: true })).toBeEnabled()
    expect(await getMarkdownContent(page, app)).toBe(before)
    await dialog.getByRole('button', { name: '轻消消', exact: true }).click()
    await expect(dialog.locator('.arcade-match button')).toHaveCount(49)
    const move = await dialog.locator('.arcade-match button').evaluateAll(cells => {
      const values = cells.map(cell => cell.textContent?.trim())
      for (let i = 0; i < 49; i++) {
        for (const j of [i + 1, i + 7]) {
          if (j >= 49 || (j === i + 1 && i % 7 === 6)) continue
          const board = [...values]
          ;[board[i], board[j]] = [board[j], board[i]]
          if (board.some((value, k) => (k % 7 < 5 && value === board[k + 1] && value === board[k + 2]) ||
            (k < 35 && value === board[k + 7] && value === board[k + 14]))) return [i, j]
        }
      }
      throw new Error('No playable match found')
    })
    await dialog.locator('.arcade-match button').nth(move[0]).click()
    await dialog.locator('.arcade-match button').nth(move[1]).click()
    await expect(dialog.locator('.arcade-stats b')).not.toHaveText('0')
    const score = await dialog.locator('.arcade-stats b').innerText()
    const board = await dialog.locator('.arcade-match button').allTextContents()
    await dialog.getByRole('button', { name: '榜单', exact: true }).click()
    await expect(dialog.locator('.arcade-ranking').first()).toContainText(score)
    await page.keyboard.press('Escape')
    await expect(dialog).not.toBeVisible()
    await page.getByRole('button', { name: '打开小憩', exact: true }).click()
    await expect(dialog.locator('.arcade-stats b')).toHaveText(score)
    await expect(dialog.locator('.arcade-match button')).toHaveText(board)
    await page.screenshot({ path: '../../.tools/arcade-preview.png' })
    await page.evaluate(() => window.dispatchEvent(new Event('blur')))
    await expect(dialog).not.toBeVisible()
    expect(await getMarkdownContent(page, app)).toBe(before)
    await enterSourceMode(page, app)
    await page.keyboard.press('Control+Alt+g')
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: '迷你数独', exact: true }).click()
    await expect(dialog.locator('.arcade-sudoku button')).toHaveCount(36)
    const empty = dialog.locator('.arcade-sudoku button:not(:disabled)').first()
    await empty.click()
    await expect(empty).toHaveClass(/selected/)
    await page.keyboard.press('Escape')
    await expect(dialog).not.toBeVisible()
    expect(await getMarkdownContent(page, app)).toBe(before)
    await expectNoRendererErrors(app)
  } finally {
    await app.close()
  }
})

test('arcade in a TXT tab preserves literal text and reloads the saved Sudoku score', async() => {
  const directory = mkdtempSync(path.join(tmpdir(), 'yarktext-arcade-'))
  const file = path.join(directory, 'notes.txt')
  const original = '# literal text\n* stays text\n'
  writeFileSync(file, original)
  const { app, page } = await launchWithDoc(file, { suppressErrorDialog: true })
  try {
    await expect(page.locator('.plain-text-editor')).toBeVisible()
    await page.getByRole('button', { name: '打开小憩', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '小憩', exact: true })
    await dialog.getByRole('button', { name: '迷你数独', exact: true }).click()
    const answer = await page.evaluate(() => {
      const saved = JSON.parse(localStorage.getItem('yarktext.arcade.v1') || '{}')
      const state = saved.sessions.sudoku.state
      const index = state.board.indexOf(0)
      return { index, value: state.solution[index] }
    })
    await dialog.locator('.arcade-sudoku button').nth(answer.index).click()
    await page.keyboard.press(String(answer.value))
    await expect(dialog.locator('.arcade-stats b')).toHaveText('10')
    await page.keyboard.press('Escape')
    expect(await page.locator('.plain-text-editor .CodeMirror').evaluate(element =>
      (element as HTMLElement & { CodeMirror: CodeMirror.Editor }).CodeMirror.getValue())).toBe(original)
    expect(readFileSync(file, 'utf8')).toBe(original)
    await page.reload()
    await expect(page.getByRole('button', { name: '打开小憩', exact: true })).toBeVisible()
    await page.getByRole('button', { name: '打开小憩', exact: true }).click()
    await expect(dialog.locator('.arcade-stats b')).toHaveText('10')
    await expect(dialog.locator('.arcade-sudoku button').nth(answer.index)).toHaveText(String(answer.value))
    await expectNoRendererErrors(app)
  } finally {
    await app.close()
    rmSync(directory, { recursive: true, force: true })
  }
})
