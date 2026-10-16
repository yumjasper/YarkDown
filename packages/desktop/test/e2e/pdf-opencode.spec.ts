import { expect, test } from '@playwright/test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { PDFDocument } from 'pdf-lib'
import type { WebPreferences } from 'electron'
import { expectNoRendererErrors, launchWithDoc } from './helpers'

test('OpenCode setup detects missing CLI, shows platform guides and keeps PDF text local', async() => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'yarktext-opencode-'))
  const filename = path.join(directory, 'setup.pdf')
  const pdf = await PDFDocument.create()
  pdf.addPage().drawText('Keep this PDF text local.', { x: 40, y: 700 })
  await writeFile(filename, await pdf.save())
  const { app, page } = await launchWithDoc(filename, {
    suppressErrorDialog: true,
    env: { YARKTEXT_OPENCODE: path.join(directory, 'missing-opencode.exe') }
  })
  try {
    await expect(page.locator('.pdf-reader .textLayer').first()).toContainText('Keep this PDF text local.')
    await page.getByRole('button', { name: 'OpenCode 翻译设置', exact: true }).click()
    const panel = page.getByRole('complementary', { name: 'OpenCode 翻译准备' })
    await expect(panel).toContainText('未找到 CLI')
    await expect(panel).toContainText('不自动提交 PDF 原文')
    const platform = panel.getByRole('combobox', { name: '操作系统' })
    await platform.selectOption('darwin')
    await expect(panel).toContainText('brew install anomalyco/tap/opencode-v2')
    await platform.selectOption('linux')
    await expect(panel).toContainText('https://opencode.ai/v2/install')
    await platform.selectOption('win32')
    await expect(panel).toContainText('Windows 独立 CLI')
    await panel.locator('.command-line').filter({ hasText: 'opencode --version' }).getByRole('button').click()
    expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe('opencode --version')
    await panel.getByRole('button', { name: '查看本页原文', exact: true }).click()
    await expect(panel.locator('.source-preview pre')).toContainText('Keep this PDF text local.')
    await app.evaluate(({ ipcMain, dialog }) => {
      ipcMain.removeHandler('mt::opencode::status')
      ipcMain.handle('mt::opencode::status', () => ({
        state: 'ready', platform: 'win32', arch: 'x64', version: 'opencode v2.0.30',
        authentication: 'not-signed-in', providers: [],
        freeModels: [{ id: 'opencode/example-free', name: 'Example Free', provider: 'opencode' }]
      }))
      dialog.showOpenDialog = async() => ({ canceled: true, filePaths: [] })
      ipcMain.removeHandler('mt::opencode::open-web')
      ipcMain.handle('mt::opencode::open-web', () => ({ ok: true }))
      ipcMain.removeHandler('mt::opencode::web-layout')
      ipcMain.handle('mt::opencode::web-layout', () => true)
      const state = globalThis as unknown as {
        translationRequests: Array<{ source: string; target: string; model: string }>
        completedLanguages: string[]
      }
      state.translationRequests = []
      state.completedLanguages = []
      ipcMain.removeHandler('mt::opencode::translate')
      ipcMain.handle('mt::opencode::translate', async(_event, _id, request: { source: string; target: string; model: string }) => {
        state.translationRequests.push(request)
        if (['en', 'de'].includes(request.target)) await new Promise(resolve => setTimeout(resolve, 500))
        state.completedLanguages.push(request.target)
        return request.target === 'fr'
          ? { ok: false, code: 'restricted', error: 'OpenCode 拒绝了免费模型的 CLI 自动调用。' }
          : { ok: true, text: `模拟译文：${request.target}` }
      })
    })
    await panel.getByRole('button', { name: '重新检测', exact: true }).click()
    await expect(panel.locator('.opencode-web-host')).toBeVisible()
    await expect(panel.locator('.web-source pre')).toHaveText('Keep this PDF text local.')
    await panel.getByRole('button', { name: '返回设置', exact: true }).click()
    await expect(panel.locator('.setup-guide')).not.toHaveAttribute('open')
    const connectionDetails = panel.locator('.setup-details').first()
    await expect(connectionDetails).not.toHaveAttribute('open')
    await connectionDetails.locator('summary').first().click()
    await expect(panel.locator('.setup-models li')).toBeVisible()
    await expect(panel).toContainText('Example Free')
    await expect(panel).toContainText('部分免费模型无需登录')
    await connectionDetails.locator('summary').first().click()
    await panel.getByRole('button', { name: '选择 CLI 文件', exact: true }).click()
    await expect(panel).toContainText('Example Free')
    await expect(panel.getByRole('button', { name: '重新检测', exact: true })).toBeEnabled()
    await panel.getByRole('button', { name: '打开 OpenCode 官方界面', exact: true }).click()
    await expect(panel.locator('.opencode-web-host')).toBeVisible()
    expect(await panel.locator('.web-controls').evaluate(element => element.getBoundingClientRect().height)).toBeLessThan(110)
    expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
    await panel.getByRole('button', { name: '复制翻译提示', exact: true }).click()
    const copied = await app.evaluate(({ clipboard }) => clipboard.readText())
    expect(copied).toContain('简体中文')
    expect(copied).toContain('Keep this PDF text local.')
    await expect(panel).toContainText('手动发送')
    await panel.getByRole('button', { name: '返回设置', exact: true }).click()
    await page.screenshot({ path: '../../.tools/opencode-setup-preview.png' })
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(900, 650))
    expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
    await expect(panel.getByRole('button', { name: '打开 OpenCode 官方界面', exact: true })).toBeInViewport()
    await page.screenshot({ path: '../../.tools/opencode-setup-narrow.png' })
    await panel.getByRole('button', { name: '关闭翻译面板', exact: true }).click()
    await expect(panel).toHaveCount(0)
    await page.locator('.textLayer span').first().evaluate(element => {
      const range = document.createRange()
      range.selectNodeContents(element)
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
    })
    const translate = page.getByRole('toolbar', { name: '选区批注菜单' }).getByRole('button', { name: 'OpenCode 翻译', exact: true })
    await expect(translate).toBeVisible()
    await expect(translate.locator('svg')).toHaveCount(1)
    await translate.click()
    await expect(panel).toBeVisible()
    await expect(panel.locator('.source-preview pre')).toContainText('Keep this PDF text local.')
    await expect(panel.locator('.comparison-result pre')).toHaveText('模拟译文：zh-Hans')
    await panel.getByRole('button', { name: '复制译文', exact: true }).click()
    expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe('模拟译文：zh-Hans')
    const target = panel.getByRole('combobox', { name: '翻译为', exact: true })
    await target.selectOption('en')
    await expect.poll(() => app.evaluate(() => (globalThis as unknown as { translationRequests: Array<{ target: string }> }).translationRequests.some(request => request.target === 'en'))).toBe(true)
    await target.selectOption('ja')
    await expect(panel.locator('.comparison-result pre')).toHaveText('模拟译文：ja')
    await expect.poll(() => app.evaluate(() => (globalThis as unknown as { completedLanguages: string[] }).completedLanguages.includes('en'))).toBe(true)
    await expect(panel.locator('.comparison-result pre')).toHaveText('模拟译文：ja')
    await target.selectOption('de')
    await expect.poll(() => app.evaluate(() => (globalThis as unknown as { translationRequests: Array<{ target: string }> }).translationRequests.some(request => request.target === 'de'))).toBe(true)
    await panel.getByRole('button', { name: '取消翻译', exact: true }).click()
    await expect(panel.getByRole('alert')).toContainText('翻译已取消')
    await expect.poll(() => app.evaluate(() => (globalThis as unknown as { completedLanguages: string[] }).completedLanguages.includes('de'))).toBe(true)
    await expect(panel.locator('.comparison-result pre')).toHaveCount(0)
    await target.selectOption('fr')
    await expect(panel.getByRole('alert')).toContainText('拒绝了免费模型')
    const requests = await app.evaluate(() => (globalThis as unknown as { translationRequests: Array<{ source: string; model: string }> }).translationRequests)
    expect(requests.every(request => request.model === 'opencode/example-free')).toBe(true)
    expect(requests[0].source).toBe('Keep this PDF text local.')
    await page.screenshot({ path: '../../.tools/opencode-cli-restriction-preview.png' })
    await panel.getByRole('button', { name: '打开 OpenCode 官方界面', exact: true }).click()
    await expect(panel.locator('.opencode-web-host')).toBeVisible()
    await panel.getByRole('button', { name: '关闭翻译面板', exact: true }).click()
    await expect(page.locator('.pdf-reader canvas').first()).toBeVisible()
    await expectNoRendererErrors(app)
  } finally {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(win => win.destroy()))
    await app.close()
    await rm(directory, { recursive: true, force: true })
  }
})

test('translates a PDF selection through the installed official CLI and shows a real comparison', async() => {
  test.skip(process.env.YARKTEXT_OPENCODE_TRANSLATION_TEST !== '1', 'Requires a locally installed OpenCode CLI and an available free model.')
  test.setTimeout(180000)
  const directory = await mkdtemp(path.join(os.tmpdir(), 'yarktext-live-translation-'))
  const filename = path.join(directory, 'translation.pdf')
  const pdf = await PDFDocument.create()
  pdf.addPage().drawText('The quick brown fox jumps over the lazy dog.', { x: 40, y: 700 })
  await writeFile(filename, await pdf.save())
  const { app, page } = await launchWithDoc(filename, { suppressErrorDialog: true })
  try {
    await expect(page.locator('.pdf-reader .textLayer').first()).toContainText('The quick brown fox')
    await page.locator('.textLayer span').first().evaluate(element => {
      const selection = window.getSelection(), range = document.createRange()
      range.selectNodeContents(element)
      selection?.removeAllRanges()
      selection?.addRange(range)
    })
    await page.getByRole('toolbar', { name: '选区批注菜单' }).getByRole('button', { name: 'OpenCode 翻译', exact: true }).click()
    const panel = page.locator('.pdf-opencode')
    await expect(panel.locator('.comparison-source pre')).toContainText('The quick brown fox')
    await expect(panel.locator('.comparison-result pre')).toContainText('狐狸', { timeout: 150000 })
    await expect(panel.getByRole('combobox', { name: '免费模型', exact: true })).toHaveValue('opencode/big-pickle')
    await expect(panel.getByRole('alert')).toHaveCount(0)
    await page.screenshot({ path: '../../.tools/opencode-cli-real-translation.png' })
    await expectNoRendererErrors(app)
  } finally {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(win => win.destroy()))
    await app.close()
    await rm(directory, { recursive: true, force: true })
  }
})

test('pairs the installed OpenCode UI in an isolated native view without submitting PDF text', async() => {
  test.skip(process.env.YARKTEXT_OPENCODE_WEB_TEST !== '1', 'Requires a locally installed OpenCode 2 service.')
  test.setTimeout(120000)
  const directory = await mkdtemp(path.join(os.tmpdir(), 'yarktext-opencode-web-'))
  const filename = path.join(directory, 'native-web.pdf')
  const pdf = await PDFDocument.create()
  pdf.addPage().drawText('Manual translation only.', { x: 40, y: 700 })
  await writeFile(filename, await pdf.save())
  const { app, page } = await launchWithDoc(filename, {
    suppressErrorDialog: true, preferences: { tabBarVisibility: true }
  })
  const nativeState = () => app.evaluate(({ BrowserWindow, WebContentsView }) => {
    const view = BrowserWindow.getAllWindows().flatMap(win => win.contentView.children)
      .find(child => child instanceof WebContentsView) as InstanceType<typeof WebContentsView> | undefined
    if (!view) return { exists: false, visible: false, paired: false, width: 0 }
    const preferences = (view.webContents as typeof view.webContents & {
      getLastWebPreferences(): WebPreferences
    }).getLastWebPreferences()
    const url = new URL(view.webContents.getURL() || 'about:blank')
    return {
      exists: true, visible: view.getVisible(), width: view.getBounds().width,
      paired: ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) && !url.pathname.startsWith('/auth/connect/'),
      sandbox: preferences.sandbox, nodeIntegration: preferences.nodeIntegration,
      contextIsolation: preferences.contextIsolation, preload: preferences.preload || ''
    }
  })
  const nativeTextLength = () => app.evaluate(async({ BrowserWindow, WebContentsView }) => {
    const view = BrowserWindow.getAllWindows().flatMap(win => win.contentView.children)
      .find(child => child instanceof WebContentsView) as InstanceType<typeof WebContentsView> | undefined
    return view ? await view.webContents.executeJavaScript('document.body.innerText.length') as number : 0
  })
  try {
    await page.getByRole('button', { name: 'OpenCode 翻译设置', exact: true }).click()
    const panel = page.locator('.pdf-opencode')
    const open = panel.getByRole('button', { name: '打开 OpenCode 官方界面', exact: true })
    await expect(panel.locator('.opencode-web-host')).toBeVisible({ timeout: 40000 })
    await expect.poll(async() => (await nativeState()).paired, { timeout: 45000 }).toBe(true)
    await panel.getByRole('button', { name: '返回设置', exact: true }).click()
    await expect.poll(async() => (await nativeState()).exists).toBe(false)
    await expect(open).toBeEnabled()
    const paid = await page.evaluate(() => window.electron.ipcRenderer.invoke('mt::opencode::translate', 'paid-guard-probe', {
      source: 'This must never be sent to a paid model.', target: 'zh-Hans', model: 'example/paid-model'
    }))
    expect(paid).toMatchObject({ ok: false, code: 'unavailable' })
    const cancelled = await page.evaluate(async() => {
      const ipc = window.electron.ipcRenderer
      const pending = ipc.invoke('mt::opencode::open-web', 'cancel-probe', { x: 600, y: 250, width: 300, height: 300 })
      await ipc.invoke('mt::opencode::close-web', 'cancel-probe')
      return pending
    })
    expect(cancelled.ok).toBe(false)
    expect((await nativeState()).exists).toBe(false)
    await open.click()
    await expect.poll(async() => (await nativeState()).paired, { timeout: 45000 }).toBe(true)
    await expect.poll(async() => (await nativeState()).visible).toBe(true)
    await expect.poll(nativeTextLength, { timeout: 30000 }).toBeGreaterThan(10)
    expect(await nativeState()).toMatchObject({ sandbox: true, nodeIntegration: false, contextIsolation: true, preload: '' })
    await panel.getByRole('button', { name: '提取本页文字', exact: true }).click()
    await panel.getByRole('button', { name: '复制翻译提示', exact: true }).click()
    expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toContain('Manual translation only.')
    const image = await app.evaluate(async({ BrowserWindow, WebContentsView }) => {
      const view = BrowserWindow.getAllWindows().flatMap(win => win.contentView.children)
        .find(child => child instanceof WebContentsView) as InstanceType<typeof WebContentsView> | undefined
      if (!view) throw new Error('Missing OpenCode native view.')
      return (await view.webContents.capturePage()).toPNG().toString('base64')
    })
    await writeFile('../../.tools/opencode-native-preview.png', Buffer.from(image, 'base64'))
    const before = (await nativeState()).width
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1050, 700))
    await expect.poll(async() => (await nativeState()).width).not.toBe(before)
    expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
    expect(await panel.locator('.web-controls').evaluate(element => element.getBoundingClientRect().height)).toBeLessThan(110)
    await page.evaluate(() => {
      const overlay = document.createElement('div')
      overlay.id = 'opencode-modal-probe'; overlay.className = 'el-overlay'
      overlay.style.cssText = 'position:fixed;inset:0;z-index:9999'
      document.body.append(overlay)
    })
    await expect.poll(async() => (await nativeState()).visible).toBe(false)
    await page.evaluate(() => document.getElementById('opencode-modal-probe')?.remove())
    await expect.poll(async() => (await nativeState()).visible).toBe(true)
    await panel.getByRole('button', { name: '返回设置', exact: true }).click()
    await expect.poll(async() => (await nativeState()).exists).toBe(false)
    await open.click()
    await expect.poll(async() => (await nativeState()).visible, { timeout: 45000 }).toBe(true)
    await page.evaluate(() => window.electron.ipcRenderer.invoke('mt::opencode::close-web', 'inactive-tab'))
    expect((await nativeState()).exists).toBe(true)
    await page.locator('.new-file').click()
    await expect.poll(async() => (await nativeState()).visible).toBe(false)
    await page.locator('.tabs-container li').filter({ hasText: 'native-web.pdf' }).click()
    if (!await panel.isVisible()) await page.getByRole('button', { name: 'OpenCode 翻译设置', exact: true }).click()
    await panel.getByRole('button', { name: '关闭翻译面板', exact: true }).click()
    await expect.poll(async() => (await nativeState()).exists).toBe(false)
    await expectNoRendererErrors(app)
  } finally {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(win => win.destroy()))
    await app.close()
    await rm(directory, { recursive: true, force: true })
  }
})
