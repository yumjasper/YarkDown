import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { resolve } from 'path'

// Lock the widened default editing column (issue: "每行渲染宽度加宽 1/3").
// Previously the desktop themes shipped `--editorAreaWidth: 750px` and the
// muya fallback was `800px`; both are now widened by roughly a third. These
// assertions read the CSS sources directly because no runtime code exposes
// the defaults — they only reach the DOM as injected `<style>` tags.

const PACKAGE_ROOT = resolve(__dirname, '../../..')
const DESKTOP_ROOT = resolve(PACKAGE_ROOT, 'src/renderer/src/assets')
const THEME_DIR = resolve(DESKTOP_ROOT, 'themes')
const DESKTOP_BASE_CSS = resolve(DESKTOP_ROOT, 'styles/index.css')
const MUYA_BASE_CSS = resolve(
  PACKAGE_ROOT,
  '../muya/src/assets/styles/index.css'
)
const MUYA_BLOCK_CSS = resolve(
  PACKAGE_ROOT,
  '../muya/src/assets/styles/blockSyntax.css'
)

const WIDENED_DESKTOP_WIDTH = '1000px'
const WIDENED_MUYA_FALLBACK = '1066px'

const read = (file: string) => readFileSync(file, 'utf8')

const themeFiles = () =>
  readdirSync(THEME_DIR)
    .filter(name => name.endsWith('.theme.css'))
    .map(name => resolve(THEME_DIR, name))

// Pulls the declared value out of `--editorAreaWidth: <value>;`
const declaredWidth = (css: string) =>
  css.match(/--editorAreaWidth:\s*([^;]+);/)?.[1].trim()

describe('default editor area width', () => {
  it('sets the widened default in the desktop base stylesheet', () => {
    expect(declaredWidth(read(DESKTOP_BASE_CSS))).toBe(WIDENED_DESKTOP_WIDTH)
  })

  it('links the muya-facing variable in the base stylesheet', () => {
    // Themes that declare no width of their own (the default `light` theme)
    // fall back to this base rule; without it they render at muya's own
    // fallback width instead of the desktop default.
    expect(read(DESKTOP_BASE_CSS)).toContain(
      '--editor-area-width: var(--editorAreaWidth);'
    )
  })

  it('never falls back to the old narrow 750px anywhere', () => {
    const sources = [
      read(DESKTOP_BASE_CSS),
      ...themeFiles().map(read),
      read(MUYA_BASE_CSS),
      read(MUYA_BLOCK_CSS)
    ]

    for (const css of sources) {
      expect(css).not.toContain('750px')
      expect(css).not.toContain('800px')
    }
  })

  it.each(themeFiles())('declares the widened default in %s', file => {
    expect(declaredWidth(read(file))).toBe(WIDENED_DESKTOP_WIDTH)
  })

  it('derives the muya-facing variable from the theme width', () => {
    for (const file of themeFiles()) {
      expect(read(file)).toContain('--editor-area-width: var(--editorAreaWidth);')
    }
  })

  it('widens the muya fallback used before a theme is applied', () => {
    expect(read(MUYA_BASE_CSS)).toContain(
      `--editor-area-width: ${WIDENED_MUYA_FALLBACK};`
    )
    // `.mu-container` max-width keeps the same fallback inline
    expect(read(MUYA_BLOCK_CSS)).toContain(
      `var(--editor-area-width, ${WIDENED_MUYA_FALLBACK})`
    )
  })

  it('keeps source-code mode on the same width variable', () => {
    const sourceCode = read(
      resolve(PACKAGE_ROOT, 'src/renderer/src/components/editorWithTabs/sourceCode.vue')
    )

    expect(sourceCode).toContain('max-width: var(--editorAreaWidth);')
  })
})
