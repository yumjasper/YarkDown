import { describe, expect, it } from 'vitest'
import { nativeMenuPosition } from '../../../src/main/utils/menuPosition'
import { mergePreferenceDefaults } from '../../../src/main/preferences/defaults'

describe('native popup coordinates', () => {
  it.each([0.5, 0.8, 1, 1.25, 1.5, 2])('converts CSS pixels at zoom %s without scaling by display DPI', zoom => {
    expect(nativeMenuPosition({ x: 173.4, y: 92.6 }, zoom)).toEqual({ x: Math.round(173.4 * zoom), y: Math.round(92.6 * zoom) })
  })
  it('keeps native cursor placement when no renderer anchor was supplied', () => {
    expect(nativeMenuPosition(undefined, 1.5)).toEqual({})
    expect(nativeMenuPosition({ x: NaN, y: 10 }, 1)).toEqual({})
  })
})

describe('preference upgrades', () => {
  it('does not send electron-store migration metadata through the settings setter', () => {
    expect(mergePreferenceDefaults({ fontSize: 14 }, { __internal__: { migrations: {} }, fontSize: 19 })).toEqual({ fontSize: 19 })
  })
  it('retains every saved value, including false, zero, empty strings and older keys', () => {
    expect(mergePreferenceDefaults({ wrap: true, size: 14, font: 'Consolas', newer: 1 }, { wrap: false, size: 0, font: '', oldCustomSetting: 'saved' })).toEqual({ wrap: false, size: 0, font: '', newer: 1, oldCustomSetting: 'saved' })
  })
})
