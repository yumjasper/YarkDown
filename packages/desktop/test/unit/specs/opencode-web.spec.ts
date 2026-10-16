import { describe, expect, it } from 'vitest'
import { clampOpenCodeBounds, isOpenCodeOrigin, parseOpenCodePairUrl } from '../../../src/main/utils/opencodeWeb'
import { openCodeTranslationPrompt } from '../../../src/renderer/src/util/openCodeTranslation'

describe('OpenCode native Web UI', () => {
  it('accepts official loopback pairing links and removes terminal color escapes', () => {
    const link = 'http://127.0.0.1:45278/auth/connect/test-once'
    expect(parseOpenCodePairUrl(`Open a link:\n${link}${String.fromCharCode(27)}[0m\n`)).toBe(link)
    expect(parseOpenCodePairUrl('http://[::1]:49374/auth/connect/one-time-code')).toContain('[::1]')
  })

  it('rejects remote, credential-bearing and unrelated links without echoing tokens', () => {
    for (const link of [
      'https://example.com/auth/connect/secret', 'http://127.0.0.1.evil.test/auth/connect/secret',
      'http://user:secret@localhost:45278/auth/connect/secret', 'file:///auth/connect/secret',
      'http://localhost:45278/api/info', 'http://localhost:45278/auth/connect/secret?redirect=https://example.com'
    ]) expect(() => parseOpenCodePairUrl(link)).toThrow('did not return a local pairing link')
  })

  it('clamps native view bounds to the owner window and accounts for editor zoom', () => {
    expect(clampOpenCodeBounds({ x: 400, y: 100, width: 400, height: 500 }, [1000, 700], 1.5))
      .toEqual({ x: 600, y: 150, width: 400, height: 550 })
    expect(clampOpenCodeBounds(null, [1000, 700], 1).width).toBe(0)
    expect(clampOpenCodeBounds({ x: NaN, y: 0, width: 1, height: 1 }, [1000, 700], 1).width).toBe(0)
    expect(clampOpenCodeBounds({ x: 0, y: 0, width: -10, height: -10 }, [1000, 700], 1).height).toBe(0)
  })

  it('only allows navigation within the paired server origin', () => {
    const origin = 'http://127.0.0.1:45278'
    expect(isOpenCodeOrigin(`${origin}/session/test`, origin)).toBe(true)
    expect(isOpenCodeOrigin('http://127.0.0.1:45279/', origin)).toBe(false)
    expect(isOpenCodeOrigin('javascript:alert(1)', origin)).toBe(false)
    expect(isOpenCodeOrigin('not a URL', origin)).toBe(false)
  })

  it('creates a user-visible clipboard prompt without changing or submitting source text', () => {
    const source = 'First paragraph.\n\n$x^2$ and "quoted text"'
    expect(openCodeTranslationPrompt(source, 'zh-Hans')).toContain('简体中文')
    expect(openCodeTranslationPrompt(source, 'en')).toContain('English')
    expect(openCodeTranslationPrompt(source, 'ja')).toContain(source)
    expect(openCodeTranslationPrompt('  ', 'en')).toBe('')
    expect(() => openCodeTranslationPrompt(source, 'invalid')).toThrow('Unsupported translation language')
  })
})
