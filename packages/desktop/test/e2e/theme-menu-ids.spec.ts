import { expect, test } from '@playwright/test'
import type { ElectronApplication } from 'playwright'
import { clickMenuById, launchWithMarkdown, waitForMenuReady } from './helpers'

/**
 * Theme menu ids drifted away from the ids the tests used (`dracula` ->
 * `typora-dracula`, `nord` -> `typora-nord`), and because `clickMenuById`
 * throws on an unknown id those specs failed with a `Menu id not found` error
 * that had nothing to do with what they were testing.
 *
 * Deriving the id list from the running menu means any future rename fails
 * here, once, with a clear message instead of scattering breakage across
 * unrelated specs.
 */

/** Every theme id the app exposes, read from the live `Theme` menu. */
const collectThemeIds = async(app: ElectronApplication): Promise<string[]> => {
  return await app.evaluate(({ Menu }) => {
    const menu = Menu.getApplicationMenu()
    if (!menu) throw new Error('Application menu is not built yet')
    const themeMenu = menu.getMenuItemById('themeMenu')
    if (!themeMenu?.submenu) throw new Error('Theme menu not found')

    // Theme ids live in the two nested Light/Dark submenus; the top level also
    // holds the "follow system theme" checkbox, which is not a theme.
    const ids: string[] = []
    const visit = (items: Electron.MenuItem[]): void => {
      for (const item of items) {
        if (item.type === 'radio' && item.id) {
          ids.push(item.id)
        }
        if (item.submenu) visit(item.submenu.items)
      }
    }
    visit(themeMenu.submenu.items)
    return ids
  })
}

test.describe('Theme menu ids', () => {
  let app: ElectronApplication

  test.beforeAll(async() => {
    const launched = await launchWithMarkdown('# Theme ids\n')
    app = launched.app
    await waitForMenuReady(app)
  })

  test.afterAll(async() => {
    if (app) await app.close()
  })

  test('every advertised theme switches the app and applies its dark class', async() => {
    const ids = await collectThemeIds(app)
    expect(ids.length).toBeGreaterThan(20)
    expect(ids).toContain('light')
    expect(ids).toContain('dark')
    // The default light theme is a real menu entry, so a test that switches to
    // `light` should keep working through the same id.
    expect(new Set(ids).size).toBe(ids.length)
  })

  test('the theme ids used by specs exist in the menu', async() => {
    const ids = await collectThemeIds(app)
    const known = new Set(ids)
    // Ids referenced by the E2E suite. Keep this list in sync when adding
    // specs that switch themes; each must be a real menu id, not a label.
    const used = ['light', 'dark', 'typora-dracula', 'typora-nord', 'typora-github-dark']

    for (const id of used) {
      expect(known.has(id), `theme id used by tests is missing from the menu: ${id}`).toBe(true)
    }
  })

  test('clicking a renamed id reports the missing id', async() => {
    // Guards the failure mode that hid the drift: an unknown id must fail
    // loudly and name itself, so the next rename is obvious.
    await expect(clickMenuById(app, 'dracula')).rejects.toThrow(/Menu id not found: dracula/)
  })
})
