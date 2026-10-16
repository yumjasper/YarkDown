import { expect, test } from '@playwright/test'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { clickMenuById, expectNoRendererErrors, launchElectron, waitForMenuReady } from './helpers'

test('MD source exports through its shared engine without changing editing mode', async() => {
  const directory = await mkdtemp(path.join(tmpdir(), 'yarktext-source-export-'))
  const file = path.join(directory, 'small.md')
  const output = path.join(directory, 'export.html')
  await writeFile(file, '# Source export\n\nActual content.\n')
  const { app, page } = await launchElectron([file], { preferences: { sourceCodeModeEnabled: true }, suppressErrorDialog: true })
  try {
    await page.locator('.source-code .CodeMirror').waitFor()
    await expect(page.locator('.mu-editor')).toHaveCount(1)
    await expect(page.locator('.editor-wrapper')).toHaveClass(/source/)
    await expect(page.locator('.editor-wrapper')).toHaveCSS('pointer-events', 'none')
    await waitForMenuReady(app)
    await app.evaluate(({ dialog }, filename) => {
      dialog.showSaveDialog = async() => ({ canceled: false, filePath: filename })
    }, output)
    await clickMenuById(app, 'export-html')
    const settings = page.locator('.print-settings-dialog .el-dialog')
    await expect(settings).toBeVisible()
    await settings.locator('button').last().click()
    await expect.poll(async() => {
      try { return await readFile(output, 'utf8') } catch { return '' }
    }).toContain('Actual content.')
    await expect(page.locator('.source-code .CodeMirror')).toBeVisible()
    await expectNoRendererErrors(app)
  } finally {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(win => win.destroy()))
    await app.close()
    await rm(directory, { recursive: true, force: true })
  }
})
