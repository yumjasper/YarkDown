import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { getThemeBackgroundColor, isDarkThemeId } from 'common/theme'
import { themes } from '@/prefComponents/theme/config'

// The theme list, the launch background map and the stylesheets are three
// hand-maintained sources that must agree. Dropping or renaming a theme in one
// place only produces a silent visual regression (white flash, preview card
// with a stale palette), so the relationship is asserted here.

const THEME_DIR = path.resolve(__dirname, '../../../src/renderer/src/assets/themes')
const PREFS_PANEL = path.resolve(
  __dirname,
  '../../../src/renderer/src/prefComponents/theme/index.vue'
)

const themeIds = themes.map((theme) => theme.name)

const backgroundOf = (id: string): string => {
  const css = readFileSync(path.join(THEME_DIR, `${id}.theme.css`), 'utf8')
  const match = css.match(/--editorBgColor\s*:\s*([^;]+);/)
  return match ? match[1].trim().toLowerCase() : ''
}

describe('theme registry', () => {
  it('paints the launch background with each theme own editor background', () => {
    for (const id of themeIds) {
      const expected = backgroundOf(id)
      expect(expected, `${id} needs --editorBgColor`).not.toBe('')
      expect(getThemeBackgroundColor(id).toLowerCase(), `${id} launch colour`).toBe(expected)
    }
  })

  it('classifies every dark theme by its own background brightness', () => {
    for (const id of themeIds) {
      const background = backgroundOf(id)
      const hex = background.replace('#', '')
      if (!/^[0-9a-f]{6}$/.test(hex)) continue
      const [r, g, b] = [0, 2, 4].map((i) => Number.parseInt(hex.slice(i, i + 2), 16))
      const perceived = (r * 299 + g * 587 + b * 114) / 1000

      // A theme whose surface is genuinely dark must be flagged dark, otherwise
      // the window chrome and icon variants pick the light branch.
      if (perceived < 80) {
        expect(isDarkThemeId(id), `${id} (#${hex}) should be classified dark`).toBe(true)
      }
      if (perceived > 200) {
        expect(isDarkThemeId(id), `${id} (#${hex}) should not be classified dark`).toBe(false)
      }
    }
  })

  it('keeps the preference panel free of removed themes', () => {
    const panel = readFileSync(PREFS_PANEL, 'utf8')
    const removed = ['graphite', 'material-dark', 'one-dark', 'ulysses']

    for (const name of removed) {
      // Guard against a stale preview rule like `&.one-dark { ... }`.
      expect(panel, `stale preview style for removed theme ${name}`).not.toMatch(
        new RegExp(`\\.${name}\\s*\\{`)
      )
    }
  })

  it('gives every preview card a heading treatment', () => {
    const panel = readFileSync(PREFS_PANEL, 'utf8')

    // The preview cards are the only per-theme visual reference in preferences;
    // a card without an h3 rule renders flatter than its neighbours.
    const missing = themeIds.filter((id) => {
      const block = panel.match(new RegExp(`\\.${id}\\s*\\{([\\s\\S]*?)\\n    \\}`))
      return block ? !block[1].includes('h3') : true
    })

    expect(missing).toEqual([])
  })
})
