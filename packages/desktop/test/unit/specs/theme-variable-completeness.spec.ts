import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { themes } from '@/prefComponents/theme/config'
import { isDarkThemeId } from 'common/theme'

// The UI shell (title bar, notifications, focus rings, uploader status hints)
// reads a set of semantic variables that the base stylesheet owns. If a theme
// omits them the widget silently keeps the light-theme fallback, which is how
// the app ended up looking half-themed on dark backgrounds. These specs assert
// every bundled theme is complete rather than spot-checking a few values.

const THEME_DIR = path.resolve(__dirname, '../../../src/renderer/src/assets/themes')
const BASE_STYLES = path.resolve(__dirname, '../../../src/renderer/src/assets/styles/index.css')

const readVariables = (css: string): Map<string, string> => {
  const map = new Map<string, string>()
  const pattern = /(--[a-zA-Z0-9]+)\s*:\s*([^;]+);/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(css)) !== null) {
    map.set(match[1], match[2].trim())
  }
  return map
}

const readTheme = (id: string): Map<string, string> => {
  return readVariables(readFileSync(path.join(THEME_DIR, `${id}.theme.css`), 'utf8'))
}

const baseVariables = readVariables(readFileSync(BASE_STYLES, 'utf8'))
const themeIds = themes.map((theme) => theme.name)

/** Parses #rgb / #rrggbb / rgba() into relative luminance for contrast checks. */
const luminanceOf = (color: string): number | null => {
  const hex = color.trim().replace('#', '')
  let channels: number[] | null = null

  if (/^[0-9a-fA-F]{3}$/.test(hex)) {
    channels = hex.split('').map((c) => Number.parseInt(c + c, 16))
  } else if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    channels = [0, 2, 4].map((i) => Number.parseInt(hex.slice(i, i + 2), 16))
  }

  if (!channels) return null
  const [r, g, b] = channels.map((value) => {
    const channel = value / 255
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

const contrastRatio = (foreground: string, background: string): number | null => {
  const fg = luminanceOf(foreground)
  const bg = luminanceOf(background)
  if (fg === null || bg === null) return null
  const lighter = Math.max(fg, bg)
  const darker = Math.min(fg, bg)
  return (lighter + 0.05) / (darker + 0.05)
}

describe('theme variable completeness', () => {
  it('ships a stylesheet for every theme in the preference list', () => {
    const files = readdirSync(THEME_DIR)
      .filter((file) => file.endsWith('.theme.css'))
      .map((file) => file.replace('.theme.css', ''))

    // Both directions: no dangling CSS file, no theme entry without styles.
    expect(new Set(files)).toEqual(new Set(themeIds))
  })

  it('defines every semantic variable the base stylesheet exposes', () => {
    // Font stacks and layout metrics are app-wide identity, declared once in the
    // base stylesheet; only colour tokens are expected to vary per theme.
    const notThemeScoped = new Set([
      '--uiFontFamily',
      '--uiFontSize',
      '--titleBarHeight',
      '--menuBarHeight',
      '--themeColor',
      '--themeColor10'
    ])
    const isColorToken = (name: string): boolean =>
      /Color|Bg|Border|Shadow|scrollbarThumb|ItemBg/i.test(name)

    const missing: string[] = []
    for (const id of themeIds) {
      const variables = readTheme(id)
      for (const name of baseVariables.keys()) {
        if (notThemeScoped.has(name)) continue
        if (!isColorToken(name)) continue
        if (!variables.has(name)) missing.push(`${id} is missing ${name}`)
      }
    }

    expect(missing).toEqual([])
  })

  it('fills both gaps of the editorColor opacity scale', () => {
    for (const id of themeIds) {
      const variables = readTheme(id)
      expect(variables.has('--editorColor70'), `${id} needs --editorColor70`).toBe(true)
      expect(variables.has('--editorColor20'), `${id} needs --editorColor20`).toBe(true)
    }
  })

  it('derives the selection highlight and focus ring from the theme accent', () => {
    for (const id of themeIds) {
      const variables = readTheme(id)
      const accent = variables.get('--themeColor')

      expect(accent, `${id} needs --themeColor`).toBeTruthy()
      expect(variables.get('--highlightThemeColor'), `${id} highlight`).toBe(accent)
      expect(variables.get('--buttonFocusBorder'), `${id} focus ring`).toContain(
        accent as string
      )
    }
  })

  it('never leaves a notification inheriting the light-theme info grey', () => {
    for (const id of themeIds) {
      const variables = readTheme(id)
      const infoBg = variables.get('--notificationInfoBg')

      expect(infoBg, `${id} needs --notificationInfoBg`).toBeTruthy()
      if (isDarkThemeId(id)) {
        // #909399 is the light-theme value; it renders as a flat grey slab on a
        // dark surface and was the visible symptom of the incomplete theming.
        expect(infoBg?.toLowerCase(), `${id} kept the light info grey`).not.toBe('#909399')
      }
    }
  })
})

describe('theme legibility', () => {
  it('keeps notification text readable on its own background', () => {
    const pairs: Array<[string, string]> = [
      ['--notificationPrimaryColor', '--notificationPrimaryBg'],
      ['--notificationInfoColor', '--notificationInfoBg'],
      ['--notificationWarningColor', '--notificationWarningBg'],
      ['--notificationErrorColor', '--notificationErrorBg']
    ]

    for (const id of themeIds) {
      const variables = readTheme(id)
      for (const [fgName, bgName] of pairs) {
        const ratio = contrastRatio(variables.get(fgName) ?? '', variables.get(bgName) ?? '')
        if (ratio === null) continue
        expect(ratio, `${id} ${fgName} on ${bgName} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(3)
      }
    }
  })

  it('keeps status colours legible against the editor background', () => {
    for (const id of themeIds) {
      const variables = readTheme(id)
      const background = variables.get('--editorBgColor') ?? ''
      for (const name of ['--successColor', '--warningColor']) {
        const ratio = contrastRatio(variables.get(name) ?? '', background)
        if (ratio === null) continue
        expect(ratio, `${id} ${name} on ${background} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(3)
      }
    }
  })

  it('gives dark themes light status hues and light themes dark ones', () => {
    for (const id of themeIds) {
      const variables = readTheme(id)
      const background = luminanceOf(variables.get('--editorBgColor') ?? '')
      const success = luminanceOf(variables.get('--successColor') ?? '')
      if (background === null || success === null) continue

      if (isDarkThemeId(id)) {
        // A dark surface needs a bright status hue; the light-theme green would
        // sit at roughly 1.9:1 and read as unreadable.
        expect(success, `${id} needs a light success hue`).toBeGreaterThan(background)
      } else {
        expect(success, `${id} needs a dark success hue`).toBeLessThan(background)
      }
    }
  })
})
