import { expect, test, type Page } from '@playwright/test'
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { clickMenuById, expectNoRendererErrors, launchElectron, sendIpcToRenderer, waitForMenuReady } from './helpers'

const forbidden = /\/(?:src-|katex-|pdfReader-|pdf\.worker|mermaid-)/

async function loadedScripts(page: Page): Promise<string[]> {
  // file: resources do not populate Resource Timing; Debugger reports scripts already parsed.
  const session = await page.context().newCDPSession(page)
  const scripts: string[] = []
  session.on('Debugger.scriptParsed', entry => { if (entry.url) scripts.push(entry.url) })
  await session.send('Debugger.enable')
  await session.send('Debugger.disable')
  await session.detach()
  expect(scripts.length).toBeGreaterThan(10)
  return scripts
}

test('TXT cold open avoids both Markdown editors and keeps save and undo', async() => {
  const directory = await mkdtemp(path.join(tmpdir(), 'yarktext-routing-txt-'))
  const file = path.join(directory, 'small.txt')
  await writeFile(file, 'Small TXT 中文\n')
  const { app, page } = await launchElectron([file], { preferences: { tabBarVisibility: true }, suppressErrorDialog: true })
  try {
    await page.locator('.plain-text-editor .CodeMirror').waitFor()
    await waitForMenuReady(app)
    await expect(page.locator('.mu-editor, .source-code:not(.plain-text-editor), .arcade-panel, .print-settings-dialog')).toHaveCount(0)
    const resources = await loadedScripts(page)
    expect(resources.filter(name => forbidden.test(name))).toEqual([])
    await page.locator('.plain-text-editor .CodeMirror').click()
    await page.keyboard.press('Control+End')
    await page.keyboard.type('Edited TXT')
    await expect(page.locator('.editor-tabs li.active')).toHaveClass(/unsaved/)
    await sendIpcToRenderer(app, 'mt::editor-ask-file-save')
    await expect.poll(() => readFile(file, 'utf8')).toContain('Edited TXT')
    await sendIpcToRenderer(app, 'mt::editor-edit-action', 'undo')
    await expect(page.locator('.plain-text-editor .CodeMirror')).not.toContainText('Edited TXT')
    await page.locator('.new-file').click()
    await expect(page.locator('.mu-editor')).toBeVisible()
    await page.locator('.mu-editor').click()
    await page.keyboard.type('First rendered editor')
    await expect(page.locator('.mu-editor')).toContainText('First rendered editor')
    await expectNoRendererErrors(app)
  } finally {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(win => win.destroy()))
    await app.close()
    await rm(directory, { recursive: true, force: true })
  }
})

test('MD source shares its initialized engine with preview, search, save and TOC', async() => {
  const directory = await mkdtemp(path.join(tmpdir(), 'yarktext-routing-source-'))
  const file = path.join(directory, 'small.md')
  await writeFile(file, '# Heading\n\nFind word and word.\n')
  const { app, page } = await launchElectron([file], { preferences: { sourceCodeModeEnabled: true, tabBarVisibility: true }, suppressErrorDialog: true })
  try {
    await page.locator('.source-code .CodeMirror').waitFor()
    await waitForMenuReady(app)
    await expect(page.locator('.mu-editor')).toHaveCount(1)
    await expect(page.locator('.editor-wrapper')).toHaveClass(/source/)
    await expect(page.locator('.editor-wrapper')).toHaveCSS('pointer-events', 'none')
    const resources = await loadedScripts(page)
    expect(resources.some(name => /\/src-/.test(name))).toBe(true)
    expect(resources.filter(name => /\/(?:pdfReader-|pdf\.worker|mermaid-|arcade-|inlineGame-|js13kGames-)/.test(name))).toEqual([])
    await sendIpcToRenderer(app, 'mt::editor-edit-action', 'replace')
    const bar = page.locator('.source-code .search-bar')
    await expect(bar).toBeVisible()
    await bar.locator('section.search input').fill('word')
    await expect(bar.locator('.search-result')).toContainText('/ 2')
    await bar.locator('.replace-input input').fill('term')
    await bar.locator('section.replace button').first().click()
    await expect(page.locator('.source-code .CodeMirror')).toContainText('Find term and term.')
    await page.keyboard.press('Escape')
    await sendIpcToRenderer(app, 'mt::editor-ask-file-save')
    await expect.poll(() => readFile(file, 'utf8')).toContain('Find term and term.')
    const headings = await page.evaluate(() => {
      const pinia = (document.querySelector('#app') as Element & { __vue_app__: { config: { globalProperties: { $pinia: { _s: Map<string, { listToc?: unknown[] }> } } } } }).__vue_app__.config.globalProperties.$pinia
      return pinia._s.get('editor')?.listToc
    })
    expect(headings).toEqual([expect.objectContaining({ content: 'Heading', slug: 'source-line-0' })])
    await page.locator('.source-code .CodeMirror').click()
    await page.keyboard.press('Control+End')
    await page.keyboard.type('Before handoff')
    await clickMenuById(app, 'sourceCodeModeMenuItem')
    await expect(page.locator('.mu-editor')).toContainText('Find term and term.')
    await expect(page.locator('.mu-editor')).toContainText('Before handoff')
    await page.locator('.mu-editor').click()
    await page.keyboard.press('Control+End')
    await page.keyboard.type('After handoff')
    await expect(page.locator('.mu-editor')).toContainText('After handoff')
    await sendIpcToRenderer(app, 'mt::editor-edit-action', 'undo')
    await expect(page.locator('.mu-editor')).not.toContainText('After handoff')
    await expect(page.locator('.editor-tabs li.active')).toHaveClass(/unsaved/)
    await clickMenuById(app, 'sourceCodeModeMenuItem')
    await expect(page.locator('.source-code .CodeMirror')).toContainText('Before handoff')
    await expectNoRendererErrors(app)
  } finally {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(win => win.destroy()))
    await app.close()
    await rm(directory, { recursive: true, force: true })
  }
})

test('first-use dialogs do not lose their initial event', async() => {
  const { app, page } = await launchElectron([], { suppressErrorDialog: true })
  try {
    await page.getByTestId('home-new-file').waitFor()
    await expect(page.locator('.about-dialog, .print-settings-dialog, .rename, .import-dialog')).toHaveCount(0)
    await sendIpcToRenderer(app, 'mt::about-dialog')
    await expect(page.locator('.about-dialog .el-dialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await page.getByTestId('home-new-file').click()
    await expect(page.locator('.mu-editor')).toBeVisible()
    await sendIpcToRenderer(app, 'mt::show-export-dialog', 'html')
    await expect(page.locator('.print-settings-dialog .el-dialog')).toBeVisible()
    await expect(page.locator('.print-settings-dialog .el-tabs')).toBeVisible()
    await expectNoRendererErrors(app)
  } finally {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(win => win.destroy()))
    await app.close()
  }
})
