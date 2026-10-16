import type { ObjectDirective } from 'vue'

type MotionValue = unknown
interface RunningMotion {
  animation: Animation
  dispose: () => void
}
const running = new WeakMap<HTMLElement, RunningMotion>()
const stop = (element: HTMLElement) => {
  const motion = running.get(element)
  if (!motion) return
  running.delete(element)
  motion.dispose()
  motion.animation.cancel()
}
const play = (element: HTMLElement, value: MotionValue, slide: boolean) => {
  stop(element)
  if (!value || typeof element.animate !== 'function') return
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
  if (preference.matches || document.hidden) return
  // Never animate geometry or retain compositor layers after the entrance finishes.
  const animation = element.animate(
    slide
      ? [{ opacity: 0, transform: 'translateX(-6px)' }, { opacity: 1, transform: 'none' }]
      : [{ opacity: 0.35 }, { opacity: 1 }],
    { duration: 160, easing: 'cubic-bezier(0.2, 0, 0, 1)' }
  )
  const cancelOnPreference = () => { if (preference.matches) stop(element) }
  const cancelOnHidden = () => { if (document.hidden) stop(element) }
  const dispose = () => {
    preference.removeEventListener('change', cancelOnPreference)
    document.removeEventListener('visibilitychange', cancelOnHidden)
  }
  preference.addEventListener('change', cancelOnPreference)
  document.addEventListener('visibilitychange', cancelOnHidden)
  running.set(element, { animation, dispose })
  animation.onfinish = () => {
    if (running.get(element)?.animation !== animation) return
    stop(element)
  }
}

// Entrance-only: editor teardown, focus and menu measurements remain synchronous.
export const vUiMotion: ObjectDirective<HTMLElement, MotionValue> = {
  mounted: (element, binding) => {
    if (binding.modifiers.appear) play(element, binding.value, !!binding.modifiers.slide)
  },
  updated: (element, binding) => {
    if (!Object.is(binding.value, binding.oldValue)) play(element, binding.value, !!binding.modifiers.slide)
  },
  beforeUnmount: stop
}
