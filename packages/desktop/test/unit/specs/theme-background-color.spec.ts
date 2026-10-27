import { describe, it, expect } from 'vitest'
import { getThemeBackgroundColor, railscastsThemes, oneDarkThemes } from 'common/theme'

// #3957: a dark theme used to flash white on launch because the main process
// only mapped a handful of themes to a background colour and every other theme
// fell back to white. `getThemeBackgroundColor` now covers every built-in theme
// and classifies unknown ones, so no dark theme is painted white.
describe('theme launch background colour (#3957)', () => {
  it('never returns white for a dark theme (no white flash on launch)', () => {
    for (const theme of [...railscastsThemes, ...oneDarkThemes]) {
      expect(getThemeBackgroundColor(theme).toLowerCase()).not.toBe('#ffffff')
    }
  })

  it('maps representative dark themes to their own editor background', () => {
    expect(getThemeBackgroundColor('typora-github-dark')).toBe('#0d1117')
    expect(getThemeBackgroundColor('typora-notion-dark')).toBe('#191919')
    expect(getThemeBackgroundColor('typora-drake-dark')).toBe('#2b2b2b')
    expect(getThemeBackgroundColor('typora-cobalt')).toBe('#193549')
    expect(getThemeBackgroundColor('typora-lapis')).toBe('#1f2433')
    expect(getThemeBackgroundColor('dark')).toBe('#282828')
  })

  it('uses the explicit background for built-in light themes', () => {
    expect(getThemeBackgroundColor('typora-newsprint')).toBe('#f9f7f1')
    expect(getThemeBackgroundColor('typora-solarized-light')).toBe('#fdf6e3')
  })

  it('falls back to white for the default light theme and unknown themes', () => {
    for (const theme of ['light', undefined, 'no-such-theme']) {
      expect(getThemeBackgroundColor(theme as string | undefined)).toBe('#ffffff')
    }
  })
})
