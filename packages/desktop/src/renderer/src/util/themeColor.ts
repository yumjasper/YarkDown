import darkTheme from '../assets/themes/dark.theme.css?inline'

// Typora 风格主题（参考 https://theme.typora.io 复刻）
import typoraGithubTheme from '../assets/themes/typora-github.theme.css?inline'
import typoraNotionTheme from '../assets/themes/typora-notion.theme.css?inline'
import typoraDrakeTheme from '../assets/themes/typora-drake.theme.css?inline'
import typoraVueTheme from '../assets/themes/typora-vue.theme.css?inline'
import typoraOrangeHeartTheme from '../assets/themes/typora-orange-heart.theme.css?inline'
import typoraNewsprintTheme from '../assets/themes/typora-newsprint.theme.css?inline'

import typoraGithubDarkTheme from '../assets/themes/typora-github-dark.theme.css?inline'
import typoraNotionDarkTheme from '../assets/themes/typora-notion-dark.theme.css?inline'
import typoraDrakeDarkTheme from '../assets/themes/typora-drake-dark.theme.css?inline'
import typoraCobaltTheme from '../assets/themes/typora-cobalt.theme.css?inline'
import typoraLapisTheme from '../assets/themes/typora-lapis.theme.css?inline'
import typoraSolarizedLightTheme from '../assets/themes/typora-solarized-light.theme.css?inline'

// Prism.js syntax highlighting themes
import darkPrismTheme from '../assets/themes/prismjs/dark.theme.css?inline'
import typoraGithubPrismTheme from '../assets/themes/prismjs/typora-github.theme.css?inline'
import typoraNotionPrismTheme from '../assets/themes/prismjs/typora-notion.theme.css?inline'
import typoraDrakePrismTheme from '../assets/themes/prismjs/typora-drake.theme.css?inline'
import typoraVuePrismTheme from '../assets/themes/prismjs/typora-vue.theme.css?inline'
import typoraOrangeHeartPrismTheme from '../assets/themes/prismjs/typora-orange-heart.theme.css?inline'
import typoraNewsprintPrismTheme from '../assets/themes/prismjs/typora-newsprint.theme.css?inline'
import typoraGithubDarkPrismTheme from '../assets/themes/prismjs/typora-github-dark.theme.css?inline'
import typoraNotionDarkPrismTheme from '../assets/themes/prismjs/typora-notion-dark.theme.css?inline'
import typoraDrakeDarkPrismTheme from '../assets/themes/prismjs/typora-drake-dark.theme.css?inline'
import typoraCobaltPrismTheme from '../assets/themes/prismjs/typora-cobalt.theme.css?inline'
import typoraLapisPrismTheme from '../assets/themes/prismjs/typora-lapis.theme.css?inline'
import typoraSolarizedLightPrismTheme from '../assets/themes/prismjs/typora-solarized-light.theme.css?inline'

export const dark = (): string => {
  return darkTheme + '\n' + darkPrismTheme
}

// Typora 风格主题 —— Light
export const typoraGithub = (): string => {
  return typoraGithubTheme + '\n' + typoraGithubPrismTheme
}

export const typoraNotion = (): string => {
  return typoraNotionTheme + '\n' + typoraNotionPrismTheme
}

export const typoraDrake = (): string => {
  return typoraDrakeTheme + '\n' + typoraDrakePrismTheme
}

export const typoraVue = (): string => {
  return typoraVueTheme + '\n' + typoraVuePrismTheme
}

export const typoraOrangeHeart = (): string => {
  return typoraOrangeHeartTheme + '\n' + typoraOrangeHeartPrismTheme
}

export const typoraNewsprint = (): string => {
  return typoraNewsprintTheme + '\n' + typoraNewsprintPrismTheme
}

// Typora 风格主题 —— Dark
export const typoraGithubDark = (): string => {
  return typoraGithubDarkTheme + '\n' + typoraGithubDarkPrismTheme
}

export const typoraNotionDark = (): string => {
  return typoraNotionDarkTheme + '\n' + typoraNotionDarkPrismTheme
}

export const typoraDrakeDark = (): string => {
  return typoraDrakeDarkTheme + '\n' + typoraDrakeDarkPrismTheme
}

export const typoraCobalt = (): string => {
  return typoraCobaltTheme + '\n' + typoraCobaltPrismTheme
}

export const typoraLapis = (): string => {
  return typoraLapisTheme + '\n' + typoraLapisPrismTheme
}

export const typoraSolarizedLight = (): string => {
  return typoraSolarizedLightTheme + '\n' + typoraSolarizedLightPrismTheme
}
