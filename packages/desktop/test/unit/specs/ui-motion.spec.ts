import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref, withDirectives, type App } from 'vue'
import { vUiMotion } from '../../../src/renderer/src/util/uiMotion'

let app: App | undefined
const animateDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate')
let animations: Array<{ cancel: ReturnType<typeof vi.fn>; onfinish: (() => void) | null }>
let animate: ReturnType<typeof vi.fn>
let preference: { matches: boolean; addEventListener: ReturnType<typeof vi.fn>; removeEventListener: ReturnType<typeof vi.fn> }
const mount = (initial: unknown, modifiers: Record<string, boolean> = {}) => {
  const state = ref(initial)
  const container = document.createElement('div')
  document.body.append(container)
  app = createApp({ render: () => withDirectives(h('div'), [[vUiMotion, state.value, undefined, modifiers]]) })
  app.mount(container)
  return state
}

beforeEach(() => {
  animations = []
  animate = vi.fn(() => {
    const animation = { cancel: vi.fn(), onfinish: null as (() => void) | null }
    animations.push(animation)
    return animation
  })
  Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate })
  preference = { matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }
  vi.stubGlobal('matchMedia', vi.fn(() => preference))
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
})
afterEach(() => {
  app?.unmount()
  app = undefined
  document.body.replaceChildren()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  if (animateDescriptor) Object.defineProperty(HTMLElement.prototype, 'animate', animateDescriptor)
  else Reflect.deleteProperty(HTMLElement.prototype, 'animate')
})

describe('lightweight UI motion', () => {
  it('skips initial trees and unchanged renders, animates only a new visible state', async() => {
    const state = mount(true)
    expect(animate).not.toHaveBeenCalled()
    state.value = false
    await nextTick()
    expect(animate).not.toHaveBeenCalled()
    state.value = true
    await nextTick()
    expect(animate).toHaveBeenCalledTimes(1)
    const [frames, options] = animate.mock.calls[0]
    expect(frames).toEqual([{ opacity: 0.35 }, { opacity: 1 }])
    expect(options).toEqual({ duration: 160, easing: 'cubic-bezier(0.2, 0, 0, 1)' })
    state.value = true
    await nextTick()
    expect(animate).toHaveBeenCalledTimes(1)
  })

  it('cancels rapid panel switches, cancels on hiding and removes listeners', async() => {
    const state = mount('files', { appear: true, slide: true })
    expect(animate.mock.calls[0][0][0]).toEqual({ opacity: 0, transform: 'translateX(-6px)' })
    state.value = 'search'
    await nextTick()
    expect(animations[0].cancel).toHaveBeenCalledTimes(1)
    expect(animate).toHaveBeenCalledTimes(2)
    state.value = ''
    await nextTick()
    expect(animations[1].cancel).toHaveBeenCalledTimes(1)
    expect(preference.removeEventListener).toHaveBeenCalledTimes(2)
  })

  it('releases finished effects instead of retaining a compositor layer', () => {
    mount(true, { appear: true })
    animations[0].onfinish?.()
    expect(animations[0].cancel).toHaveBeenCalledTimes(1)
    expect(preference.removeEventListener).toHaveBeenCalledTimes(1)
  })

  it('respects reduced motion and stops an active effect if the preference changes', async() => {
    preference.matches = true
    const state = mount(true, { appear: true })
    expect(animate).not.toHaveBeenCalled()
    preference.matches = false
    state.value = 'menu'
    await nextTick()
    expect(animate).toHaveBeenCalledTimes(1)
    preference.matches = true
    const listener = preference.addEventListener.mock.calls[0][1] as () => void
    listener()
    expect(animations[0].cancel).toHaveBeenCalledTimes(1)
  })

  it('does not animate background windows', () => {
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
    mount(true, { appear: true })
    expect(animate).not.toHaveBeenCalled()
  })

  it('stops active effects when the window becomes hidden and removes the listener', () => {
    const remove = vi.spyOn(document, 'removeEventListener')
    mount('general', { appear: true })
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(animations[0].cancel).toHaveBeenCalledTimes(1)
    expect(remove).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
    document.dispatchEvent(new Event('visibilitychange'))
    expect(animations[0].cancel).toHaveBeenCalledTimes(1)
  })

  it('cancels in-flight animations on unmount', () => {
    mount(true, { appear: true })
    app?.unmount()
    app = undefined
    expect(animations[0].cancel).toHaveBeenCalledTimes(1)
    expect(preference.removeEventListener).toHaveBeenCalledTimes(1)
  })
})
