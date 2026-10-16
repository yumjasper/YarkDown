/* The frame has an opaque origin; persist only its original game keys through the host. */
export function createGameStorage () {
  const values = JSON.parse(decodeURIComponent(window.location.hash.slice(1) || '%7B%7D'))
  const send = (message) =>
    window.parent.postMessage({ channel: 'yarktext-js13k', ...message }, '*')
  window.addEventListener('pointerdown', () => window.focus(), true)
  window.addEventListener('contextmenu', (event) => event.preventDefault())
  window.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Escape' || (event.ctrlKey && event.altKey && event.code === 'KeyG')) {
        event.preventDefault()
        event.stopImmediatePropagation()
        if (event.key === 'Escape' && document.pointerLockElement) document.exitPointerLock()
        else send({ type: 'close' })
      }
    },
    true
  )
  window.addEventListener('error', () => send({ type: 'error' }))
  window.addEventListener('unhandledrejection', () => send({ type: 'error' }))
  window.addEventListener('load', () => send({ type: 'ready' }))
  document.addEventListener('pointerlockchange', () => {
    send({ type: 'pointer-lock', locked: !!document.pointerLockElement })
  })
  document.addEventListener('pointerlockerror', () => send({ type: 'pointer-lock', locked: false }))
  const storage = {
    getItem: (key) => (Object.hasOwn(values, key) ? values[key] : null),
    setItem: (key, value) => {
      values[key] = String(value)
      send({ type: 'save', key, value: String(value) })
    },
    removeItem: (key) => {
      delete values[key]
      send({ type: 'save', key, value: null })
    }
  }
  // The racing engine uses property access for its original lap record key.
  return new Proxy(storage, {
    get: (target, key) => (key in target ? target[key] : values[key]),
    set: (_target, key, value) => {
      storage.setItem(String(key), value)
      return true
    }
  })
}
