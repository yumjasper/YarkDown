import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { expectNoRendererErrors, launchElectron } from './helpers'

test.describe('启动 YarkText', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeAll(async() => {
    const { app: electronApp, page: firstPage } = await launchElectron([], { suppressErrorDialog: true })
    app = electronApp
    page = firstPage
  })

  test.afterAll(async() => {
    await app.close()
  })

  test('初始化完成后显示主界面', async() => {
    await expect(page.locator('.side-bar')).toBeAttached()
    await expect(page.locator('.boot-shell')).toHaveCount(0)
    await expect(page.locator('.editor-placeholder')).toHaveCount(0)
    const title = await page.title()
    expect(title).toContain('YarkText')
    await expectNoRendererErrors(app)
  })
})
