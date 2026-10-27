import { describe, expect, it } from 'vitest'
import { useAccessibilityPerformanceMode } from '../../../src/main/windows/accessibility'

describe('accessibility performance compatibility mode', () => {
  it('requires an explicit Windows performance opt-in', () => {
    expect(useAccessibilityPerformanceMode('win32', 'performance')).toBe(true)
  })
  it.each([undefined, '', 'default', 'full', 'Performance'])('retains accessibility for mode %s', mode => {
    expect(useAccessibilityPerformanceMode('win32', mode)).toBe(false)
  })
  it.each(['darwin', 'linux'])('does not override accessibility on %s', platform => {
    expect(useAccessibilityPerformanceMode(platform, 'performance')).toBe(false)
  })
})
