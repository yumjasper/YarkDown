export interface ThemeDescriptor {
  name: string
}

// 除默认 light 外的可选主题。名称与 assets/themes/<name>.theme.css 一一对应，
// 并统一带 `typora-` 前缀以标明设计来源（https://theme.typora.io）。
export const themes: ReadonlyArray<ThemeDescriptor> = [
  // Light themes
  { name: 'typora-github' },
  { name: 'typora-notion' },
  { name: 'typora-drake' },
  { name: 'typora-vue' },
  { name: 'typora-orange-heart' },
  { name: 'typora-solarized-light' },
  { name: 'typora-newsprint' },
  { name: 'typora-ayu-light' },
  { name: 'typora-one-light' },
  { name: 'typora-pixyll' },
  { name: 'typora-whitey' },
  { name: 'typora-ia-light' },
  { name: 'typora-typo' },
  { name: 'typora-inkwell-blue' },
  { name: 'typora-lucid-light' },
  { name: 'typora-arkfield' },
  { name: 'typora-vlook-owl' },
  { name: 'typora-vlook-note' },
  { name: 'typora-vlook-joint' },
  // Dark themes
  { name: 'dark' },
  { name: 'typora-github-dark' },
  { name: 'typora-notion-dark' },
  { name: 'typora-drake-dark' },
  { name: 'typora-cobalt' },
  { name: 'typora-lapis' },
  { name: 'typora-nord' },
  { name: 'typora-dracula' },
  { name: 'typora-catppuccin' },
  { name: 'typora-one-dark' },
  { name: 'typora-gruvbox' },
  { name: 'typora-tokyo-night' },
  { name: 'typora-rose-pine' },
  { name: 'typora-lucid-dark' }
]

// getAutoSwitchThemeOptions removed - no longer needed
// We now use a boolean toggle for followSystemTheme instead of a dropdown
