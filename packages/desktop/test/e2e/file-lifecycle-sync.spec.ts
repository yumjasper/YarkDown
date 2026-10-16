import { expect, test } from '@playwright/test'
import { mkdtemp, mkdir, writeFile, readFile, access, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { launchElectron, expectNoRendererErrors, sendIpcToRenderer } from './helpers'

test('new tabs, opened list, project selection and dirty rename share the current document', async() => {
  test.setTimeout(60000)
  const directory = await mkdtemp(path.join(tmpdir(), 'yarktext-files-sync-'))
  const project = path.join(directory, 'project'), inside = path.join(project, 'inside.txt'), outside = path.join(directory, 'outside.txt')
  await mkdir(project); await writeFile(inside, 'inside'); await writeFile(outside, 'outside')
  const { app, page: firstPage } = await launchElectron([project], { suppressErrorDialog: true })
  let page = firstPage
  try {
    await expect.poll(async() => {
      for (const candidate of app.windows()) {
        if (await candidate.locator('.side-bar-file').filter({ hasText: 'inside.txt' }).count()) {
          page = candidate
          return true
        }
      }
      return false
    }).toBe(true)
    await page.locator('.side-bar-file').filter({ hasText: 'inside.txt' }).click()
    await expect(page.locator('.opened-file.active')).toContainText('inside.txt')
    await page.evaluate(filename => window.electron.ipcRenderer.send('mt::open-file', filename, {}), outside)
    await expect(page.locator('.opened-file.active')).toContainText('outside.txt')
    await expect(page.locator('.project-tree .side-bar-file.active')).toHaveCount(0)
    await page.locator('.new-file').click()
    await expect(page.locator('.opened-file.active')).toContainText('Untitled-')
    await expect(page.locator('.opened-file')).toHaveCount(3)
    await page.locator('.opened-file').filter({ hasText: 'outside.txt' }).click()
    const cm = page.locator('.plain-text-editor .CodeMirror')
    await cm.click(); await page.keyboard.press('Control+End'); await page.keyboard.type(' edited')
    await expect(page.locator('.tabs-container li.active')).toHaveClass(/unsaved/)
    await sendIpcToRenderer(app, 'mt::editor-rename-file')
    const input = page.locator('.rename input.search')
    await expect(input).toBeVisible(); await input.fill('renamed.txt'); await input.press('Enter')
    await expect.poll(() => access(path.join(directory, 'renamed.txt')).then(() => true, () => false)).toBe(true)
    await expect(page.locator('.opened-file.active')).toContainText('renamed.txt')
    await expect(page.locator('.tabs-container li.active')).toContainText('renamed.txt')
    await expect(page.locator('.tabs-container li.active')).toHaveClass(/unsaved/)
    await sendIpcToRenderer(app, 'mt::editor-ask-file-save')
    await expect.poll(() => readFile(path.join(directory, 'renamed.txt'), 'utf8')).toBe('outside edited')
    await expect(page.locator('.opened-file.active')).not.toHaveClass(/unsaved/)
    await page.locator('.side-bar-file').filter({ hasText: 'inside.txt' }).click()
    await page.keyboard.press('F2')
    const sidebarRename = page.locator('.side-bar-file input.rename')
    await expect(sidebarRename).toBeVisible()
    await sidebarRename.fill('inside-renamed.txt')
    await sidebarRename.press('Enter')
    await expect(page.locator('.opened-file.active')).toContainText('inside-renamed.txt')
    await expect(page.locator('.tabs-container li.active')).toContainText('inside-renamed.txt')
    await expect(page.locator('.tabs-container li.active')).not.toHaveClass(/unsaved/)
    await expect(page.locator('.side-bar-file.current')).toHaveAttribute('title', path.join(project, 'inside-renamed.txt'))
    await expectNoRendererErrors(app)
  } finally {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(win => win.destroy()))
    await app.close(); await rm(directory, { recursive: true, force: true })
  }
})
