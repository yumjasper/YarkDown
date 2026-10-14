import { describe, expect, it } from 'vitest'
import { editorBackdropOptions } from 'main_renderer/windows/backdrop'
import { shellHeaderHeights } from '@/util/shellLayout'

describe('Windows system backdrop', () => {
  it('uses DWM Acrylic without a layered transparent window on Windows 11 22H2', () => {
    expect(editorBackdropOptions('win32', '10.0.22621', 'custom')).toEqual({
      backgroundMaterial: 'acrylic',
      backgroundColor: '#00000000',
      transparent: false
    })
  })
  it('keeps the opaque editor canvas for native title bars', () => {
    expect(editorBackdropOptions('win32', '10.0.26100', 'native')).toEqual({
      backgroundMaterial: 'acrylic'
    })
  })
  it.each(['10.0.19045', '10.0.22000', 'invalid', 'invalid.0.26100'])(
    'retains the normal window on unsupported releases: %s',
    (release) => {
      expect(editorBackdropOptions('win32', release, 'custom')).toEqual({})
    }
  )
  it.each(['darwin', 'linux'])('leaves %s windows to their platform implementation', (platform) => {
    expect(editorBackdropOptions(platform, '10.0.26100', 'custom')).toEqual({})
  })
})
describe('shell header space', () => {
  it('reserves a compact title and menu row for custom Windows chrome', () => {
    expect(shellHeaderHeights('custom', false)).toEqual({ title: 30, menu: 26 })
  })
  it('does not leave an empty strip under a native Windows title bar', () => {
    expect(shellHeaderHeights('native', false)).toEqual({ title: 0, menu: 0 })
  })
  it('reserves the macOS traffic-light area without adding a Windows menu row', () => {
    expect(shellHeaderHeights('native', true)).toEqual({ title: 28, menu: 0 })
  })
})
