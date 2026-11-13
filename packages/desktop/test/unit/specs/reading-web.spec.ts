import { describe, expect, it } from 'vitest'
import {
  clampReadingBounds,
  isReadingNavigation,
  isTranslationRequest,
  isReadingId,
  translationPageUrl,
  translationResultScript
} from '../../../src/main/utils/readingWeb'

describe('official translation page adapter', () => {
  it('encodes source as data and only chooses fixed official pages', () => {
    const text = 'A & B # <script> "中文"\nnext'
    for (const provider of ['bing', 'google'] as const) {
      const url = new URL(translationPageUrl(provider, text))
      expect(url.protocol).toBe('https:')
      expect(url.searchParams.get('text')).toBe(text)
      expect(url.searchParams.get(provider === 'google' ? 'tl' : 'to')).toBe(
        provider === 'google' ? 'zh-CN' : 'zh-Hans'
      )
      expect(new URL(translationPageUrl(provider)).searchParams.has('text')).toBe(false)
    }
  })
  it('allows translation/login hosts but rejects unsafe schemes, userinfo and spoofed hosts', () => {
    expect(isReadingNavigation('https://accounts.google.com/login', 'google')).toBe(true)
    expect(isReadingNavigation('https://login.live.com/', 'bing')).toBe(true)
    expect(isReadingNavigation('https://cn.bing.com/translator', 'bing')).toBe(true)
    for (const url of [
      'javascript:alert(1)',
      'http://www.bing.com/',
      'https://www.bing.com.evil.test/',
      'https://user:pass@www.bing.com/',
      'https://translate.google.com/'
    ])
      expect(isReadingNavigation(url, 'bing')).toBe(false)
  })
  it('limits requests and does not accept arbitrary providers or URLs', () => {
    expect(isTranslationRequest({ source: 'hello', provider: 'bing' })).toBe(true)
    for (const request of [
      null,
      {},
      { source: '', provider: 'google' },
      { source: 'x'.repeat(5001), provider: 'bing' },
      { source: 'hello', provider: 'https://evil.test' }
    ])
      expect(isTranslationRequest(request)).toBe(false)
    expect(isReadingId('selection-1')).toBe(true)
    expect(isReadingId('../file')).toBe(false)
  })
  it('clips view bounds with editor zoom and hides invalid layouts', () => {
    expect(
      clampReadingBounds({ x: 400, y: 100, width: 400, height: 500 }, [1000, 700], 1.5)
    ).toEqual({ x: 600, y: 150, width: 400, height: 550 })
    expect(clampReadingBounds(null, [1000, 700], 1).width).toBe(0)
    expect(clampReadingBounds({ x: NaN, y: 0, width: 10, height: 10 }, [1000, 700], 1).width).toBe(
      0
    )
  })
  it('restricts extraction scripts to public result nodes', () => {
    for (const provider of ['google', 'bing'] as const) {
      const script = translationResultScript(provider)
      expect(script).not.toMatch(/cookie|localStorage|password|fetch|XMLHttpRequest/)
    }
  })
})
