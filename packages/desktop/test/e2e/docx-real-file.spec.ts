import { expect, test } from '@playwright/test'
import { stat, rm } from 'node:fs/promises'
import path from 'node:path'
import { launchWithDoc, clickMenuById, expectNoRendererErrors } from './helpers'

const fixture = process.env.YARKTEXT_DOCX_FIXTURE

test('exports an explicitly supplied real Markdown document', async() => {
  test.skip(!fixture, 'Set YARKTEXT_DOCX_FIXTURE to a local Markdown file')
  test.setTimeout(900000)
  const output = path.resolve('../../.tools/real-file-export.docx')
  await rm(output, { force: true })
  if (!fixture) throw new Error('Missing YARKTEXT_DOCX_FIXTURE')
  const { app, page } = await launchWithDoc(fixture, { suppressErrorDialog: true })
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  try {
    await page.evaluate(() => {
      window.electron.ipcRenderer.on('mt::show-notification', (_event, payload) => {
        document.documentElement.dataset.exportFailure = JSON.stringify(payload)
      })
    })
    await app.evaluate(({ dialog }, filename) => { dialog.showSaveDialog = async() => ({ canceled: false, filePath: filename }) }, output)
    await clickMenuById(app, 'export-docx')
    await page.locator('.print-settings-dialog .el-dialog .button-primary').click()
    let failure = ''
    await expect.poll(async() => {
      failure = await page.evaluate(() => document.documentElement.dataset.exportFailure || '')
      if (failure) return true
      try { return (await stat(output)).size > 1000 } catch { return false }
    }, { timeout: 840000, intervals: [1000] }).toBe(true)
    if (failure) throw new Error(failure)
    await expectNoRendererErrors(app)
  } catch (error) {
    throw new Error(`${error}\n${errors.join('\n')}`, { cause: error })
  } finally {
    await app.close()
  }
})
