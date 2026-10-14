import { expect, test } from '@playwright/test'
import {
  enterSourceMode,
  exitSourceMode,
  expectNoRendererErrors,
  getMarkdownContent,
  launchWithMarkdown,
  placeCaretInEditor,
  sendIpcToRenderer,
  setSourceMarkdown,
  typeIntoEditor
} from './helpers'

// One journey keeps startup cost constant and avoids leaking state between independent tests.
test('desktop smoke: render, edit, source roundtrip, save and new tab', async() => {
  test.setTimeout(60000)
  const { app, page, filePath } = await launchWithMarkdown(
    '# Smoke test\n\nInitial paragraph.\n\n- [ ] Smoke task\n',
    { suppressErrorDialog: true, env: { MARKTEXT_EXIT_ON_ERROR: '1' } }
  )
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.stack || error.message))
  try {
    await test.step('render markdown', async() => {
      await expect(page.locator('.editor-component h1')).toContainText('Smoke test')
      await expect(page.locator('.editor-component input[type=checkbox]')).toHaveCount(1)
    })
    await test.step('edit and preserve content across source mode', async() => {
      await placeCaretInEditor(page)
      await typeIntoEditor(page, ' smoke-token')
      await expect.poll(() => getMarkdownContent(page, app)).toContain('smoke-token')
      await setSourceMarkdown(page, app, '# Updated smoke\n\nSaved smoke-token.\n')
      await expect(page.locator('.editor-component h1')).toContainText('Updated smoke')
      await enterSourceMode(page, app)
      await exitSourceMode(page, app)
      expect(await getMarkdownContent(page, app)).toContain('Saved smoke-token.')
    })
    await test.step('save to the isolated temporary document', async() => {
      const { readFile } = await import('node:fs/promises')
      // Synthetic keyboard input does not reliably invoke Electron's native accelerators.
      await sendIpcToRenderer(app, 'mt::editor-ask-file-save')
      await expect.poll(() => readFile(filePath, 'utf8')).toContain('Saved smoke-token.')
    })
    await test.step('create a new tab through IPC', async() => {
      const tabs = page.locator('.tabs-container > li')
      const before = await tabs.count()
      await sendIpcToRenderer(app, 'mt::new-untitled-tab', true, '')
      await expect(tabs).toHaveCount(before + 1)
    })
    await expectNoRendererErrors(app)
    expect(pageErrors).toEqual([])
  } finally {
    await app.close()
  }
})
