export interface TranslationSnapshot {
  input: string
  output: string
  changed: boolean
  complete?: boolean
}
export interface TranslationPollingOptions {
  source: string
  signal: AbortSignal
  read: () => Promise<TranslationSnapshot | null>
  prepare?: () => Promise<void>
  timeoutMs?: number
  intervalMs?: number
  stableMs?: number
  onPreview?: (text: string) => void
}
const pause = (signal: AbortSignal, milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    if (signal.aborted) {
      resolve()
      return
    }
    const finish = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', finish)
      resolve()
    }
    const timer = setTimeout(finish, milliseconds)
    signal.addEventListener('abort', finish, { once: true })
  })
const stopped = Symbol('stopped')
const withinDeadline = <T>(
  action: () => Promise<T>,
  signal: AbortSignal,
  deadline: number
): Promise<T | typeof stopped> =>
  new Promise((resolve, reject) => {
    if (signal.aborted || Date.now() >= deadline) {
      resolve(stopped)
      return
    }
    const cleanup = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', finish)
    }
    const finish = () => {
      cleanup()
      resolve(stopped)
    }
    const timer = setTimeout(finish, deadline - Date.now())
    signal.addEventListener('abort', finish, { once: true })
    Promise.resolve()
      .then(action)
      .then(
        (value) => {
          cleanup()
          resolve(value)
        },
        (error) => {
          cleanup()
          reject(error)
        }
      )
  })
const sameSource = (a: string, b: string) =>
  a.replace(/\s+/g, ' ').trim() === b.replace(/\s+/g, ' ').trim()
export const waitForTranslation = async(
  options: TranslationPollingOptions
): Promise<string | null> => {
  const deadline = Date.now() + (options.timeoutMs ?? 18000)
  let previous = '',
    since = 0
  while (!options.signal.aborted && Date.now() < deadline) {
    if (
      options.prepare &&
      (await withinDeadline(options.prepare, options.signal, deadline)) === stopped
    )
      break
    if (options.signal.aborted) break
    const snapshot = await withinDeadline(options.read, options.signal, deadline)
    if (snapshot === stopped || options.signal.aborted) break
    const output = snapshot?.output.trim() || ''
    // Bing appends an ellipsis to the previous result while translating the new input.
    const pending = /(?:\.{3}|…)\s*$/.test(output) && !/(?:\.{3}|…)\s*$/.test(options.source)
    if (
      snapshot &&
      sameSource(snapshot.input, options.source) &&
      snapshot.changed &&
      !pending &&
      output &&
      output.length <= 30000 &&
      /[\u3400-\u9fff]/.test(output)
    ) {
      if (output !== previous) {
        previous = output
        since = Date.now()
        options.onPreview?.(output)
      } else if (snapshot.complete !== false && Date.now() - since >= (options.stableMs ?? 180)) return output
    } else {
      previous = ''
      since = 0
    }
    await pause(
      options.signal,
      Math.min(options.intervalMs ?? 100, Math.max(0, deadline - Date.now()))
    )
  }
  return null
}
