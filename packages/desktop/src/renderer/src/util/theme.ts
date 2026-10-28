import {
  THEME_STYLE_ID,
  COMMON_STYLE_ID,
  DEFAULT_CODE_FONT_FAMILY,
  oneDarkThemes,
  railscastsThemes
} from '../config'
import {
  dark,
  typoraGithub,
  typoraNotion,
  typoraDrake,
  typoraVue,
  typoraOrangeHeart,
  typoraNewsprint,
  typoraGithubDark,
  typoraNotionDark,
  typoraDrakeDark,
  typoraCobalt,
  typoraLapis,
  typoraSolarizedLight,
  typoraNord,
  typoraDracula,
  typoraCatppuccin,
  typoraAyuLight,
  typoraOneLight,
  typoraPixyll,
  typoraWhitey,
  typoraOneDark,
  typoraGruvbox,
  typoraIaLight,
  typoraTypo,
  typoraTokyoNight,
  typoraRosePine,
  typoraInkwellBlue,
  typoraLucidLight,
  typoraLucidDark,
  typoraArkfield,
  typoraVlookOwl,
  typoraVlookNote,
  typoraVlookJoint
} from './themeColor'
import { isLinux } from './index'

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const ORIGINAL_THEME = '#409EFF'

// Theme id -> CSS builder. Keeping this in one map means adding a theme is a
// single entry rather than a matching pair of import and switch case.
const THEME_BUILDERS: Record<string, () => string> = {
  dark,
  'typora-github': typoraGithub,
  'typora-notion': typoraNotion,
  'typora-drake': typoraDrake,
  'typora-vue': typoraVue,
  'typora-orange-heart': typoraOrangeHeart,
  'typora-newsprint': typoraNewsprint,
  'typora-github-dark': typoraGithubDark,
  'typora-notion-dark': typoraNotionDark,
  'typora-drake-dark': typoraDrakeDark,
  'typora-cobalt': typoraCobalt,
  'typora-lapis': typoraLapis,
  'typora-solarized-light': typoraSolarizedLight,
  'typora-nord': typoraNord,
  'typora-dracula': typoraDracula,
  'typora-catppuccin': typoraCatppuccin,
  'typora-ayu-light': typoraAyuLight,
  'typora-one-light': typoraOneLight,
  'typora-pixyll': typoraPixyll,
  'typora-whitey': typoraWhitey,
  'typora-one-dark': typoraOneDark,
  'typora-gruvbox': typoraGruvbox,
  'typora-ia-light': typoraIaLight,
  'typora-typo': typoraTypo,
  'typora-tokyo-night': typoraTokyoNight,
  'typora-rose-pine': typoraRosePine,
  'typora-inkwell-blue': typoraInkwellBlue,
  'typora-lucid-light': typoraLucidLight,
  'typora-lucid-dark': typoraLucidDark,
  'typora-arkfield': typoraArkfield,
  'typora-vlook-owl': typoraVlookOwl,
  'typora-vlook-note': typoraVlookNote,
  'typora-vlook-joint': typoraVlookJoint
}

// Themes rendered on a dark background. Drives the `dark` body class that
// swaps UI icons to their light variants.
const DARK_THEME_IDS = new Set([
  'dark',
  'typora-github-dark',
  'typora-notion-dark',
  'typora-drake-dark',
  'typora-cobalt',
  'typora-lapis',
  'typora-nord',
  'typora-dracula',
  'typora-catppuccin',
  'typora-one-dark',
  'typora-gruvbox',
  'typora-tokyo-night',
  'typora-rose-pine',
  'typora-lucid-dark'
])

/**
 * Whether a theme renders on a dark background.
 *
 * Chart themes (Mermaid/Vega) and the `dark` body class must agree, so both read
 * this instead of re-deriving from the theme id — a dark theme whose id omits
 * `dark` would otherwise get light charts on a dark canvas.
 */
export const isDarkTheme = (theme: string): boolean => {
  return railscastsThemes.includes(theme) || oneDarkThemes.includes(theme) || DARK_THEME_IDS.has(theme)
}

/**
 * Wrap a theme stylesheet for the editor window.
 *
 * The theme must outrank `@muyajs/core`'s built-in light defaults, which cover
 * both the kebab-case editor variables (`--editor-bg-color`, `--table-border-color`,
 * …) and the Prism token palette. Those defaults live inside `@layer
 * muya-defaults`, so any unlayered rule wins regardless of load order and no
 * specificity juggling is needed here.
 */
const patchTheme = (css: string): string => {
  return `@media not print {\n${css}\n}`
}

const getEmojiPickerPatch = (): string => {
  return isLinux
    ? '.mu-emoji-picker section .emoji-wrapper .item span { font-family: sans-serif, "Noto Color Emoji"; }'
    : ''
}

export const addThemeStyle = (theme: string): void => {
  const isDark = isDarkTheme(theme)
  let themeStyleEle = document.querySelector(`#${THEME_STYLE_ID}`) as HTMLStyleElement | null
  if (!themeStyleEle) {
    themeStyleEle = document.createElement('style')
    themeStyleEle.id = THEME_STYLE_ID
    document.head.appendChild(themeStyleEle)
  }

  if (theme === 'light') {
    // The default light theme lives in the main stylesheet; it only needs the
    // alias variables that element rules reference by their kebab-case names.
    themeStyleEle.innerHTML = patchTheme(
      ':root {\n  --link-color: var(--linkColor);\n  --blockquote-border-color: var(--blockquoteBorderColor);\n}'
    )
  } else {
    const build = THEME_BUILDERS[theme]
    themeStyleEle.innerHTML = build ? patchTheme(build()) : ''
  }

  // workaround: use dark icons
  document.body.classList.remove('dark')
  if (isDark) {
    document.body.classList.add('dark')
  }

  // change CodeMirror theme
  const cm = document.querySelector('.CodeMirror')
  if (cm) {
    cm.classList.remove('cm-s-default')
    cm.classList.remove('cm-s-one-dark')
    cm.classList.remove('cm-s-railscasts')
    if (oneDarkThemes.includes(theme)) {
      cm.classList.add('cm-s-one-dark')
    } else if (railscastsThemes.includes(theme)) {
      cm.classList.add('cm-s-railscasts')
    } else {
      cm.classList.add('cm-s-default')
    }
  }
}

export const setEditorWidth = (value: string): void => {
  const EDITOR_WIDTH_STYLE_ID = 'editor-width'
  let result = ''
  if (value && /^[0-9]+(?:ch|px|%)$/.test(value)) {
    // Add 100px for the container's horizontal padding. Set both the legacy
    // camelCase var (source mode) and the kebab-case var the active
    // @muyajs/core engine reads for `.mu-container` max-width (issue #4828).
    const width = `calc(100px + ${value})`
    result = `:root { --editorAreaWidth: ${width}; --editor-area-width: ${width}; }`
  }
  let styleEle = document.querySelector(`#${EDITOR_WIDTH_STYLE_ID}`) as HTMLStyleElement | null
  if (!styleEle) {
    styleEle = document.createElement('style')
    styleEle.setAttribute('id', EDITOR_WIDTH_STYLE_ID)
    document.head.appendChild(styleEle)
  }

  styleEle.innerHTML = result
}

export interface CommonStyleOptions {
  codeFontFamily: string
  codeFontSize: number | string
  hideScrollbar?: boolean
  [key: string]: unknown
}

export const addCommonStyle = (options: CommonStyleOptions): void => {
  const { codeFontFamily, codeFontSize, hideScrollbar } = options
  let sheet = document.querySelector(`#${COMMON_STYLE_ID}`) as HTMLStyleElement | null
  if (!sheet) {
    sheet = document.createElement('style')
    sheet.id = COMMON_STYLE_ID
    document.head.appendChild(sheet)
  }

  let scrollbarStyle = ''
  if (hideScrollbar) {
    scrollbarStyle = '::-webkit-scrollbar {display: none;}'
  }

  sheet.innerHTML = `${scrollbarStyle}
.CodeMirror {
font-family: ${codeFontFamily}, ${DEFAULT_CODE_FONT_FAMILY};
font-size: ${codeFontSize}px;
}

${getEmojiPickerPatch()}
`
}

export interface CustomStyleOptions {
  customCss?: string
  [key: string]: unknown
}

export const addCustomStyle = (options: CustomStyleOptions): void => {
  const { customCss } = options
  if (!customCss) {
    document.querySelector('#custom-styles')?.remove()
    return
  }

  let customStyleEle = document.querySelector('#custom-styles') as HTMLStyleElement | null
  if (!customStyleEle) {
    customStyleEle = document.createElement('style')
    customStyleEle.id = 'custom-styles'
    document.head.appendChild(customStyleEle)
  }
  customStyleEle.innerHTML = customCss
}

export interface AddStylesOptions extends CommonStyleOptions {
  theme: string
}

// Append common sheet and theme at the end of head - order is important.
export const addStyles = (options: AddStylesOptions): void => {
  const { theme } = options
  addThemeStyle(theme)
  addCommonStyle(options)
}
