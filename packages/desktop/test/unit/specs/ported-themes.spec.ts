import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { themes } from '@/prefComponents/theme/config'

// Themes ported from upstream open-source palettes (Nord, Dracula,
// Catppuccin, Ayu, Atom One). They are easy to add by copying a neighbour's
// file and forgetting a registration hop, which leaves the theme half-wired:
// missing from the menu, no syntax highlighting, or an untranslated label. The
// hops are asserted explicitly here because the generic completeness specs only
// cover variables and the preference list.

const SRC = path.resolve(__dirname, '../../../src')
const LOCALES = path.resolve(__dirname, '../../../static/locales')
const PROJECT_ROOT = path.resolve(__dirname, '../../..')

const read = (relative: string): string => readFileSync(path.join(SRC, relative), 'utf8')

interface PortedTheme {
  readonly id: string
  readonly labelKey: string
  readonly isDark: boolean
}

const PORTED: ReadonlyArray<PortedTheme> = [
  { id: 'typora-nord', labelKey: 'typoraNord', isDark: true },
  { id: 'typora-dracula', labelKey: 'typoraDracula', isDark: true },
  { id: 'typora-catppuccin', labelKey: 'typoraCatppuccin', isDark: true },
  { id: 'typora-ayu-light', labelKey: 'typoraAyuLight', isDark: false },
  { id: 'typora-one-light', labelKey: 'typoraOneLight', isDark: false },
  { id: 'typora-pixyll', labelKey: 'typoraPixyll', isDark: false },
  { id: 'typora-whitey', labelKey: 'typoraWhitey', isDark: false },
  { id: 'typora-one-dark', labelKey: 'typoraOneDark', isDark: true },
  { id: 'typora-gruvbox', labelKey: 'typoraGruvbox', isDark: true },
  { id: 'typora-ia-light', labelKey: 'typoraIaLight', isDark: false },
  { id: 'typora-typo', labelKey: 'typoraTypo', isDark: false },
  { id: 'typora-tokyo-night', labelKey: 'typoraTokyoNight', isDark: true },
  { id: 'typora-rose-pine', labelKey: 'typoraRosePine', isDark: true }
]

const localeFiles = ['en', 'zh-CN', 'zh-TW', 'ja', 'ko', 'de', 'fr', 'es', 'pt', 'ru', 'nl', 'tr']

const darkThemeIds = (): string => {
  const registry = read('renderer/src/util/theme.ts')
  const start = registry.indexOf('DARK_THEME_IDS')
  // Slice to the closing bracket so a light theme id that merely appears
  // elsewhere in the module cannot satisfy the assertion below.
  return registry.slice(start, registry.indexOf('])', start))
}

describe('ported themes', () => {
  it('registers each ported theme in the renderer theme table', () => {
    const registry = read('renderer/src/util/theme.ts')
    const darkIds = darkThemeIds()

    for (const { id, isDark } of PORTED) {
      // A missing key here silently falls back to the base stylesheet, so the
      // theme would look like the default light theme when selected.
      expect(registry, `${id} missing from THEME_BUILDERS`).toContain(`'${id}':`)

      // Misclassifying a theme flips the icon set and window chrome, which is
      // very visible on light themes rendered with dark icons.
      if (isDark) {
        expect(darkIds, `${id} should be listed as dark`).toContain(`'${id}'`)
      } else {
        expect(darkIds, `${id} should not be listed as dark`).not.toContain(`'${id}'`)
      }
    }
  })

  it('bundles a prism stylesheet so code blocks are not left unstyled', () => {
    const builders = read('renderer/src/util/themeColor.ts')

    for (const { id } of PORTED) {
      // The builder concatenates theme + prism CSS; without the prism half the
      // code block keeps the previous theme's token colours.
      const prismImport = `assets/themes/prismjs/${id}.theme.css`
      expect(builders, `${id} prism stylesheet not imported`).toContain(prismImport)
      expect(
        readFileSync(
          path.join(SRC, 'renderer/src/assets/themes/prismjs', `${id}.theme.css`),
          'utf8'
        ).length,
        `${id} prism stylesheet is empty`
      ).toBeGreaterThan(200)
    }
  })

  it('appears in the matching menu group', () => {
    const menu = readFileSync(
      path.join(PROJECT_ROOT, 'src/main/menu/templates/theme.ts'),
      'utf8'
    )
    const groupOf = (name: string): string => {
      const declaration = menu.indexOf(`${name}:`)
      const listStart = menu.indexOf('= [', declaration)
      // The closing bracket sits at column 0; matching '\n]' skips the
      // ']' characters inside the generic type and the array entries.
      return menu.slice(listStart, menu.indexOf('\n]', listStart))
    }
    const lightGroup = groupOf('LIGHT_THEMES')
    const darkGroup = groupOf('DARK_THEMES')

    for (const { id, labelKey, isDark } of PORTED) {
      const group = isDark ? darkGroup : lightGroup
      const otherGroup = isDark ? lightGroup : darkGroup

      expect(group, `${id} missing from its menu group`).toContain(`'${id}'`)
      expect(otherGroup, `${id} filed under the wrong menu group`).not.toContain(`'${id}'`)
      expect(group, `${labelKey} label key not wired`).toContain(`'${labelKey}'`)
    }
  })

  it('carries a translated name in every shipped locale', () => {
    for (const locale of localeFiles) {
      const json = JSON.parse(
        readFileSync(path.join(LOCALES, `${locale}.json`), 'utf8')
      ) as { menu: { theme: Record<string, string> } }

      for (const { labelKey } of PORTED) {
        // An untranslated key renders as the raw key path in the menu.
        expect(json.menu.theme[labelKey], `${locale} is missing ${labelKey}`).toBeTruthy()
      }
    }
  })

  it('is exposed in the preference list so the cards are reachable', () => {
    const ids = themes.map((theme) => theme.name)

    for (const { id } of PORTED) {
      expect(ids, `${id} has no preference entry`).toContain(id)
    }
  })
})
