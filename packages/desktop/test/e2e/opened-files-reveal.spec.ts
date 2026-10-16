import { expect, test } from '@playwright/test'
import type { Page } from 'playwright'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { launchElectron, expectNoRendererErrors } from './helpers'

const activeRowIsFullyVisible = (page: Page): Promise<boolean> =>
  page.evaluate(() => {
    const container = document.querySelector('.opened-files-list')
    const row = container?.querySelector('.opened-file.active')
    if (!container || !row || !container.getClientRects().length) return false
    const viewport = container.getBoundingClientRect()
    const bounds = row.getBoundingClientRect()
    return bounds.top >= viewport.top - 1 && bounds.bottom <= viewport.bottom + 1
  })

const openedListScrollTop = (page: Page): Promise<number> =>
  page.locator('.opened-files-list').evaluate((element) => element.scrollTop)

test('overflowing opened files reveals the active log and unsaved tabs without changing project scroll', async() => {
  test.setTimeout(60000)
  const directory = await mkdtemp(path.join(tmpdir(), 'yarktext-opened-reveal-'))
  const project = path.join(directory, 'project')
  await mkdir(project)
  const first = path.join(project, 'first.txt')
  const log = path.join(directory, '半透明log.txt')
  const markdownFiles = ['chapter-1.md', 'chapter-2.md', 'chapter-3.md'].map((name) => path.join(project, name))
  await writeFile(first, 'first document')
  await writeFile(log, 'LogTemp: Warning: LumenTranslucencyVolumeLighting\n')
  await Promise.all(markdownFiles.map((file) => writeFile(file, '# Chapter\n')))
  await Promise.all(Array.from({ length: 40 }, (_, index) =>
    writeFile(path.join(project, `extra-${String(index).padStart(2, '0')}.txt`), 'extra')))

  const { app, page } = await launchElectron([first], {
    suppressErrorDialog: true,
    preferences: { openedFilesInSidebar: true, autoRevealInSidebar: false }
  })
  try {
    await expect(page.locator('.plain-text-editor .CodeMirror')).toBeVisible()
    await app.evaluate(({ BrowserWindow, ipcMain }, root) => {
      const win = BrowserWindow.getAllWindows()[0]
      ipcMain.emit('app-open-directory-by-id', win.id, root, true)
    }, project)
    await expect(page.locator('.tree-wrapper .side-bar-file').filter({ hasText: 'first.txt' })).toHaveCount(1)
    for (const file of markdownFiles) {
      await page.evaluate((filename) => window.electron.ipcRenderer.send('mt::open-file', filename, {}), file)
      await expect(page.locator('.opened-file.active .name')).toHaveText(path.basename(file))
    }
    await page.locator('.new-file').click()
    const untitled = await page.locator('.opened-file.active .name').innerText()
    await page.locator('.editor-component').click()
    await page.keyboard.type('unsaved note')
    await expect(page.locator('.opened-file.active')).toHaveClass(/unsaved/)
    await page.evaluate((filename) => window.electron.ipcRenderer.send('mt::open-file', filename, {}), log)
    await expect(page.locator('.opened-file')).toHaveCount(6)
    await expect(page.locator('.opened-file.active .name')).toHaveText('半透明log.txt')
    await expect.poll(() => activeRowIsFullyVisible(page)).toBe(true)
    expect(await openedListScrollTop(page)).toBeGreaterThan(0)
    await expect(page.locator('.project-tree .side-bar-file.current')).toHaveCount(0)

    await page.locator('.tree-wrapper').evaluate((element) => { element.scrollTop = 120 })
    const projectScroll = await page.locator('.tree-wrapper').evaluate((element) => element.scrollTop)
    const tab = (name: string) => page.locator('.tabs-container li').filter({ hasText: name })
    await tab('first.txt').click()
    await expect(page.locator('.opened-file.active .name')).toHaveText('first.txt')
    await expect.poll(() => activeRowIsFullyVisible(page)).toBe(true)
    expect(await openedListScrollTop(page)).toBe(0)

    await tab('chapter-1.md').click()
    await expect(page.locator('.opened-file.active .name')).toHaveText('chapter-1.md')
    await expect.poll(() => activeRowIsFullyVisible(page)).toBe(true)
    expect(await openedListScrollTop(page)).toBe(0)

    const heading = page.locator('.opened-files > .title > span')
    await heading.click()
    await tab('半透明log.txt').click()
    await expect(page.locator('.opened-files-list')).toBeHidden()
    await heading.click()
    await expect.poll(() => activeRowIsFullyVisible(page)).toBe(true)
    expect(await page.locator('.tree-wrapper').evaluate((element) => element.scrollTop)).toBe(projectScroll)

    const filesIcon = page.locator('.rail-icon').first()
    await filesIcon.click()
    await tab('first.txt').click()
    await tab('半透明log.txt').click()
    await filesIcon.click()
    await expect.poll(() => activeRowIsFullyVisible(page)).toBe(true)

    await page.locator('.opened-file.active').hover()
    await page.locator('.opened-file.active .close-icon').click()
    await expect(page.locator('.opened-file')).toHaveCount(5)
    await expect(page.locator('.opened-file.active .name')).toHaveText(untitled)
    await expect(page.locator('.opened-file.active')).toHaveClass(/unsaved/)
    await expect.poll(() => activeRowIsFullyVisible(page)).toBe(true)
    await expectNoRendererErrors(app)
  } finally {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach((win) => win.destroy()))
    await app.close()
    await rm(directory, { recursive: true, force: true })
  }
})
