import { expect, test } from '@playwright/test'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { PDFDocument } from 'pdf-lib'
import type { OpenDialogOptions } from 'electron'
import { expectNoRendererErrors, launchElectron } from './helpers'

test('cold home defers editors and opens recent files and new documents', async() => {
  const directory = await mkdtemp(path.join(tmpdir(), 'yarktext-home-'))
  const filename = path.join(directory, 'recent.txt')
  const profile = path.join(directory, 'profile')
  await mkdir(profile)
  await writeFile(filename, 'Recent file content')
  await writeFile(path.join(profile, 'recently-used-documents.json'), JSON.stringify([filename]))
  const { app, page } = await launchElectron([], { userDataDir: profile, preferences: { tabBarVisibility: true }, suppressErrorDialog: true })
  try {
    await expect(page.getByTestId('home-new-file')).toBeVisible()
    await expect(page.locator('.editor-component, .mu-editor, .pdf-reader')).toHaveCount(0)
    const resources = await page.evaluate(() => performance.getEntriesByType('resource').map(entry => entry.name))
    expect(resources.some(name => /editorWithTabs-|pdfReader-|katex-|\/src-/.test(name))).toBe(false)
    await app.evaluate(({ dialog }) => {
      const state = global as unknown as { homePickerModes: string[][] }
      state.homePickerModes = []
      dialog.showOpenDialog = async(...args: unknown[]) => {
        const options = args.at(-1) as OpenDialogOptions
        state.homePickerModes.push(options?.properties ?? [])
        return { canceled: true, filePaths: [] }
      }
    })
    await page.getByRole('button', { name: '打开文件', exact: true }).click()
    await expect.poll(() => app.evaluate(() => (global as unknown as { homePickerModes: string[][] }).homePickerModes.length)).toBe(1)
    await page.getByRole('button', { name: '打开文件夹', exact: true }).click()
    await expect.poll(() => app.evaluate(() => (global as unknown as { homePickerModes: string[][] }).homePickerModes.length)).toBe(2)
    const pickerModes = await app.evaluate(() => (global as unknown as { homePickerModes: string[][] }).homePickerModes)
    expect(pickerModes[0]).toContain('openFile')
    expect(pickerModes[1]).toContain('openDirectory')
    await page.locator('.home-recents button').filter({ hasText: 'recent.txt' }).click()
    await expect(page.locator('.plain-text-editor')).toContainText('Recent file content')
    await page.locator('.new-file').click()
    await expect(page.locator('.mu-editor')).toBeVisible()
    await page.locator('.mu-editor').click()
    await page.keyboard.type('First lazy editor input')
    await expect(page.locator('.mu-editor')).toContainText('First lazy editor input')
    await expectNoRendererErrors(app)
  } finally {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(win => win.destroy()))
    await app.close()
    await rm(directory, { recursive: true, force: true })
  }
})

test('restored PDF stays dormant until the selected sidebar file is clicked', async() => {
  test.setTimeout(60000)
  const profile = await mkdtemp(path.join(tmpdir(), 'yarktext-home-pdf-'))
  const filename = path.join(profile, 'restored.pdf')
  const document = await PDFDocument.create()
  document.addPage().drawText('Deferred PDF')
  await writeFile(filename, await document.save())
  await mkdir(path.join(profile, 'editorStates'))
  await writeFile(path.join(profile, 'editorStates', 'home_editor_buffer_store.json'), JSON.stringify({
    currentFileId: 'restored',
    tabs: [{ id: 'restored', filename: 'restored.pdf', pathname: filename, markdown: '', isSaved: true }],
    layout: { showSideBar: true, rightColumn: 'files', showTabBar: true, sideBarWidth: 280 }
  }))
  const { app, page } = await launchElectron([], { userDataDir: profile, preferences: { startUpAction: 'restoreAll', sideBarVisibility: true }, suppressErrorDialog: true })
  try {
    await expect(page.getByTestId('home-continue')).toContainText('restored.pdf')
    await expect(page.locator('.pdf-reader, .editor-component')).toHaveCount(0)
    await page.locator('.opened-file.active').click()
    await expect(page.locator('.pdf-reader .textLayer').first()).toContainText('Deferred PDF')
    await expectNoRendererErrors(app)
  } finally {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(win => win.destroy()))
    await app.close()
    await rm(profile, { recursive: true, force: true })
  }
})
