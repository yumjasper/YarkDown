import { expect, test } from '@playwright/test'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { launchElectron, expectNoRendererErrors } from './helpers'

test('missing saved files are skipped while missing dirty files recover as unsaved documents', async() => {
  test.setTimeout(60000)
  const profile = await mkdtemp(path.join(tmpdir(), 'yarktext-restore-missing-'))
  const states = path.join(profile, 'editorStates')
  await mkdir(states)
  await writeFile(path.join(states, 'recovery_editor_buffer_store.json'), JSON.stringify({
    currentFileId: 'missing-clean',
    tabs: [
      { id: 'missing-clean', pathname: path.join(profile, 'missing.md'), filename: 'missing.md', markdown: '# saved', isSaved: true },
      { id: 'missing-draft', pathname: path.join(profile, 'draft.txt'), filename: 'draft.txt', markdown: 'valuable unsaved text', isSaved: false }
    ],
    project: { rootDirectory: path.join(profile, 'missing-folder') },
    layout: { showSideBar: true, rightColumn: 'files', showTabBar: true, sideBarWidth: 280 }
  }))
  let { app, page } = await launchElectron([], { userDataDir: profile, preferences: { startUpAction: 'restoreAll', sideBarVisibility: true, tabBarVisibility: true }, suppressErrorDialog: true })
  try {
    await expect(page.locator('.opened-file')).toHaveCount(1)
    await expect(page.locator('.opened-file.active')).toContainText('draft.txt')
    await expect(page.locator('.plain-text-editor')).toHaveCount(0)
    await page.getByTestId('home-continue').click()
    await expect(page.locator('.plain-text-editor')).toContainText('valuable unsaved text')
    await expect(page.locator('.tabs-container li.active')).toHaveClass(/unsaved/)
    await expect(page.getByText('原文件已不存在', { exact: false })).toBeVisible()
    await expect(page.locator('.notification.error')).toHaveCount(0)
    await expectNoRendererErrors(app)
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(win => win.destroy()))
    await app.close()
    ;({ app, page } = await launchElectron([], { userDataDir: profile, suppressErrorDialog: true }))
    await expect(page.locator('.opened-file.active')).toContainText('draft.txt')
    await expect(page.locator('.plain-text-editor')).toHaveCount(0)
    await page.getByTestId('home-continue').click()
    await expect(page.locator('.plain-text-editor')).toContainText('valuable unsaved text')
    await expect(page.locator('.notification.error')).toHaveCount(0)
    await expectNoRendererErrors(app)
  } finally {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(win => win.destroy())).catch(() => {})
    await app.close().catch(() => {})
    await rm(profile, { recursive: true, force: true })
  }
})
