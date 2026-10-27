// Themes painted on a dark background. Used for the dark-mode classification
// that drives window background and icon variants.
export const railscastsThemes: readonly string[] = Object.freeze([
  'dark',
  'typora-github-dark',
  'typora-notion-dark',
  'typora-drake-dark',
  'typora-cobalt',
  'typora-lapis'
])

export const oneDarkThemes: readonly string[] = Object.freeze([])

export const isDarkThemeId = (theme: unknown): theme is string => {
  return (
    typeof theme === 'string' && (railscastsThemes.includes(theme) || oneDarkThemes.includes(theme))
  )
}

// Each built-in theme's editor background colour, kept in sync with the
// `--editorBgColor` of the matching renderer theme (renderer/src/assets/themes/
// *.theme.css; the default light theme lives in styles/index.css and is handled
// by the white fallback below). The main process paints a freshly-created window
// with this colour before the renderer loads, so a dark theme no longer flashes
// white on launch (#3957).
const themeBackgroundColors: ReadonlyMap<string, string> = new Map([
  ['dark', '#282828'],
  ['typora-cobalt', '#193549'],
  ['typora-drake', '#ffffff'],
  ['typora-drake-dark', '#2b2b2b'],
  ['typora-github', '#ffffff'],
  ['typora-github-dark', '#0d1117'],
  ['typora-lapis', '#1f2433'],
  ['typora-newsprint', '#f9f7f1'],
  ['typora-notion', '#ffffff'],
  ['typora-notion-dark', '#191919'],
  ['typora-orange-heart', '#fffefb'],
  ['typora-solarized-light', '#fdf6e3'],
  ['typora-vue', '#ffffff']
])

const DARK_FALLBACK_BACKGROUND = '#282828'
const LIGHT_FALLBACK_BACKGROUND = '#ffffff'

/**
 * Background colour to paint a freshly-created window before the renderer
 * loads, so the window matches the active theme instead of flashing white
 * (#3957). Falls back by dark/light classification for any theme without an
 * explicit colour (e.g. the default light theme or a future/custom theme).
 */
export const getThemeBackgroundColor = (theme: string | undefined): string => {
  const exact = typeof theme === 'string' ? themeBackgroundColors.get(theme) : undefined
  if (exact) return exact
  return isDarkThemeId(theme) ? DARK_FALLBACK_BACKGROUND : LIGHT_FALLBACK_BACKGROUND
}
