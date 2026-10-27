// Pre-building the markdown-math mode costs a one-off ~20 ms of lazy module
// setup and multiplexer construction, which otherwise lands inside the frame
// that mounts CodeMirror on the FIRST source-mode entry of a session - the one
// frame the user notices. Warming it while the app is idle moves that cost to a
// moment nobody is waiting on an interaction.
import codeMirror from './core'
import registerMarkdownMathMode from './markdownMathMode'

registerMarkdownMathMode(codeMirror)

const MODE_SPEC = {
  name: 'markdown-math',
  texMathDollars: true,
  texMathGfm: true,
  texMathSingleBackslash: true,
  texMathDoubleBackslash: true
}

const WARM_LINES = 40

let warmed = false

/**
 * Build the markdown-math mode once, off-screen, so the first real source-mode
 * mount does not pay for the mode's construction on the interaction frame.
 * Deliberately tiny: this only needs CodeMirror to instantiate the multiplexer,
 * not to lay out a real document. Warming with the real document was measured
 * too: it pushed the opening frame of the 33k-character tutorial to 380 ms,
 * because the idle callback still runs on the main thread.
 */
export const warmMarkdownMathMode = (): void => {
  if (warmed || typeof document === 'undefined')
    return
  warmed = true

  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:600px;height:400px;visibility:hidden;'
  document.body.appendChild(host)

  const lines: string[] = []
  for (let index = 0; index < WARM_LINES; index++)
    lines.push(`warm ${index} $a_${index} + b_${index}$ and $$c_${index}$$`)

  try {
    const instance = (codeMirror as unknown as (
      target: HTMLElement,
      config: Record<string, unknown>
    ) => { getWrapperElement: () => HTMLElement })(host, {
      value: lines.join('\n'),
      lineNumbers: true,
      viewportMargin: 30,
      mode: MODE_SPEC
    })
    instance.getWrapperElement().remove()
  }
  finally {
    host.remove()
  }
}

/**
 * Run `warmMarkdownMathMode` after the first paint, when the main thread is
 * idle. Falls back to a timeout where `requestIdleCallback` is unavailable.
 */
export const scheduleMarkdownMathWarmup = (): void => {
  const run = () => {
    try {
      warmMarkdownMathMode()
    }
    catch {
      // A warmup failure must never break the editor; the real mount still builds
      // the mode on demand.
    }
  }
  const idle = (window as unknown as {
    requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number
  }).requestIdleCallback
  if (typeof idle === 'function')
    idle(run, { timeout: 3000 })
  else
    setTimeout(run, 1200)
}

