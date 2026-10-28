import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mountVlookEnhance, isVlookEnhanceTheme } from '@/util/vlookEnhance'

// jsdom does not implement layout, so `getBoundingClientRect` returns zeros and
// `scrollTo` is a no-op. Both are stubbed per test where the value matters.
const buildEditor = (html: string): HTMLElement => {
  const scroll = document.createElement('div')
  scroll.className = 'mu-editor'
  const container = document.createElement('div')
  container.className = 'mu-container'
  container.innerHTML = html
  scroll.appendChild(container)
  document.body.appendChild(scroll)
  return scroll
}

describe('isVlookEnhanceTheme', () => {
  it('recognises the three VLOOK themes', () => {
    expect(isVlookEnhanceTheme('typora-vlook-owl')).toBe(true)
    expect(isVlookEnhanceTheme('typora-vlook-note')).toBe(true)
    expect(isVlookEnhanceTheme('typora-vlook-joint')).toBe(true)
  })

  it('rejects themes outside the VLOOK family', () => {
    expect(isVlookEnhanceTheme('typora-github')).toBe(false)
    expect(isVlookEnhanceTheme('dark')).toBe(false)
    expect(isVlookEnhanceTheme('')).toBe(false)
  })
})

describe('mountVlookEnhance', () => {
  beforeEach(() => {
    // `requestAnimationFrame` is not part of jsdom's default globals.
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0)
      return 0
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  it('returns null for a non-VLOOK theme so callers can skip teardown', () => {
    const scroll = buildEditor('<p>hi</p>')
    expect(mountVlookEnhance('typora-github', scroll)).toBeNull()
    expect(document.getElementById('vlook-enhance-root')).toBeNull()
  })

  it('builds a chapter list from top-level headings only', () => {
    const scroll = buildEditor(
      '<h1>Title</h1><p>body</p><h2>Section</h2><blockquote><h2>Nested</h2></blockquote>'
    )
    const handle = mountVlookEnhance('typora-vlook-owl', scroll)
    expect(handle).not.toBeNull()

    const items = Array.from(document.querySelectorAll('.v-toc-item')).map((el) => el.textContent)
    // The heading inside the blockquote is not a direct child of `.mu-container`,
    // so it must not appear: an unscoped query would shift every later index.
    expect(items).toEqual(['Title', 'Section'])
    expect(document.querySelector('.v-toc-item')?.getAttribute('data-level')).toBeNull()
    expect(document.querySelectorAll('.v-toc-level-1').length).toBe(1)
    expect(document.querySelectorAll('.v-toc-level-2').length).toBe(1)

    handle?.destroy()
  })

  it('skips headings with no visible text', () => {
    const scroll = buildEditor('<h1>Real</h1><h2>   </h2>')
    mountVlookEnhance('typora-vlook-owl', scroll)
    const items = Array.from(document.querySelectorAll('.v-toc-item')).map((el) => el.textContent)
    expect(items).toEqual(['Real'])
  })

  it('labels alert quotes and leaves ordinary quotes untouched', () => {
    const scroll = buildEditor(
      '<blockquote><p>[!WARNING]</p><p>careful</p></blockquote><blockquote><p>plain</p></blockquote>'
    )
    mountVlookEnhance('typora-vlook-note', scroll)

    const alerts = document.querySelectorAll('.v-alert')
    expect(alerts.length).toBe(1)
    expect(alerts[0]?.classList.contains('v-alert-warning')).toBe(true)
    expect(alerts[0]?.querySelector('.v-alert-title')?.textContent).toBe('WARNING')
  })

  it('numbers footnote definitions and marks tables for crosshair highlight', () => {
    const scroll = buildEditor(
      '<figure class="mu-footnote"><div class="mu-footnote-input"></div></figure>' +
        '<figure class="mu-footnote"><div class="mu-footnote-input"></div></figure>' +
        '<figure class="mu-table"><div class="mu-table-inner"></div></figure>'
    )
    mountVlookEnhance('typora-vlook-joint', scroll)

    const badges = Array.from(document.querySelectorAll('.v-footnote-pn')).map(
      (el) => el.textContent
    )
    expect(badges).toEqual(['1', '2'])
    expect(document.querySelector('.mu-table-inner')?.classList.contains('v-tbl-x')).toBe(true)
  })

  it('removes every injected node on destroy', () => {
    const scroll = buildEditor('<h1>Title</h1><p>body</p>')
    const handle = mountVlookEnhance('typora-vlook-owl', scroll)
    expect(document.getElementById('vlook-enhance-root')).not.toBeNull()

    handle?.destroy()
    expect(document.getElementById('vlook-enhance-root')).toBeNull()
  })

  it('replaces the previous panel when mounted twice', () => {
    const first = buildEditor('<h1>First</h1>')
    mountVlookEnhance('typora-vlook-owl', first)
    document.body.removeChild(first)

    const second = buildEditor('<h1>Second</h1>')
    mountVlookEnhance('typora-vlook-owl', second)

    const panels = document.querySelectorAll('.v-toc')
    expect(panels.length).toBe(1)
    expect(panels[0]?.textContent).toBe('Second')
  })
})
