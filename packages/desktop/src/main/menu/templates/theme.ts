/*
 * Typora 主题（参考 https://theme.typora.io 复刻）
 */
import { type MenuItemConstructorOptions } from 'electron'
import * as actions from '../actions/theme'
import { t } from '../../i18n'
import type Preference from '../../preferences'

// [i18nLabelKey, themeId] for each selectable theme. The menu label is
// `menu.theme.<labelKey>`; `themeId` is both the menu item id and the value
// passed to `selectTheme` / compared against the saved theme. (`cadmiumLight`
// and `cadmiumDark` are historical keys that map to the default light/dark.)
const LIGHT_THEMES: ReadonlyArray<readonly [string, string]> = [
  ['cadmiumLight', 'light'],
  ['typoraGithub', 'typora-github'],
  ['typoraNotion', 'typora-notion'],
  ['typoraDrake', 'typora-drake'],
  ['typoraVue', 'typora-vue'],
  ['typoraOrangeHeart', 'typora-orange-heart'],
  ['typoraSolarizedLight', 'typora-solarized-light'],
  ['typoraNewsprint', 'typora-newsprint'],
  ['typoraAyuLight', 'typora-ayu-light'],
  ['typoraOneLight', 'typora-one-light'],
  ['typoraPixyll', 'typora-pixyll'],
  ['typoraWhitey', 'typora-whitey'],
  ['typoraIaLight', 'typora-ia-light'],
  ['typoraTypo', 'typora-typo'],
  ['typoraInkwellBlue', 'typora-inkwell-blue'],
  ['typoraLucidLight', 'typora-lucid-light'],
  ['typoraArkfield', 'typora-arkfield'],
  ['typoraVlookOwl', 'typora-vlook-owl'],
  ['typoraVlookNote', 'typora-vlook-note'],
  ['typoraVlookJoint', 'typora-vlook-joint']
]

const DARK_THEMES: ReadonlyArray<readonly [string, string]> = [
  ['cadmiumDark', 'dark'],
  ['typoraGithubDark', 'typora-github-dark'],
  ['typoraNotionDark', 'typora-notion-dark'],
  ['typoraDrakeDark', 'typora-drake-dark'],
  ['typoraCobalt', 'typora-cobalt'],
  ['typoraLapis', 'typora-lapis'],
  ['typoraNord', 'typora-nord'],
  ['typoraDracula', 'typora-dracula'],
  ['typoraCatppuccin', 'typora-catppuccin'],
  ['typoraOneDark', 'typora-one-dark'],
  ['typoraGruvbox', 'typora-gruvbox'],
  ['typoraTokyoNight', 'typora-tokyo-night'],
  ['typoraRosePine', 'typora-rose-pine'],
  ['typoraLucidDark', 'typora-lucid-dark']
]

export default function(userPreference: Preference): MenuItemConstructorOptions {
  const preferences = userPreference.getAll() as { theme?: string; followSystemTheme?: boolean }
  const { theme, followSystemTheme } = preferences
  const isThemeSelectionEnabled = !followSystemTheme

  const themeRadio = ([labelKey, id]: readonly [string, string]): MenuItemConstructorOptions => ({
    label: t(`menu.theme.${labelKey}`),
    type: 'radio',
    id,
    enabled: isThemeSelectionEnabled,
    checked: theme === id,
    click() {
      actions.selectTheme(id)
    }
  })

  const submenu: MenuItemConstructorOptions[] = [
    // Follow System Theme
    {
      label: t('preferences.theme.followSystemTheme'),
      type: 'checkbox',
      id: 'follow-system-theme',
      checked: !!followSystemTheme,
      click(menuItem) {
        actions.setFollowSystemTheme(menuItem.checked)
      }
    }
  ]

  if (!isThemeSelectionEnabled) {
    submenu.push({
      label: t('menu.theme.followThemDisabled'),
      enabled: false
    })
  }

  // Group themes into nested submenus so the top-level Theme menu stays short
  // instead of expanding to the full window height with 30+ flat items (#4534).
  submenu.push(
    { type: 'separator' },
    {
      label: t('menu.theme.lightThemes'),
      submenu: LIGHT_THEMES.map(themeRadio)
    },
    {
      label: t('menu.theme.darkThemes'),
      submenu: DARK_THEMES.map(themeRadio)
    }
  )

  return {
    label: t('menu.theme.theme'),
    id: 'themeMenu',
    submenu
  }
}
