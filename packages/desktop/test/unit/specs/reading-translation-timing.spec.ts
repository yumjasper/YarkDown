import { afterEach, describe, expect, it, vi } from 'vitest'
import { waitForTranslation } from '../../../src/main/utils/readingTranslation'

afterEach(() => vi.useRealTimers())
describe('translation readiness without full page loading', () => {
  it('returns a stable matching result within a short window', async() => {
    vi.useFakeTimers()
    const read = vi.fn(async() => ({ input: 'new sentence', output: '新的句子', changed: true }))
    const result = waitForTranslation({
      source: 'new sentence',
      signal: new AbortController().signal,
      read
    })
    await vi.advanceTimersByTimeAsync(250)
    await expect(result).resolves.toBe('新的句子')
    expect(read).toHaveBeenCalledTimes(3)
  })
  it('waits for the new source and an actual changed result', async() => {
    vi.useFakeTimers()
    let input = 'previous',
      changed = false,
      output = '上一句的译文'
    const finished = vi.fn()
    const result = waitForTranslation({
      source: 'new',
      signal: new AbortController().signal,
      read: async() => ({ input, output, changed }),
      timeoutMs: 1000
    })
    void result.then(finished)
    await vi.advanceTimersByTimeAsync(250)
    input = 'new'
    await vi.advanceTimersByTimeAsync(250)
    expect(finished).not.toHaveBeenCalled()
    changed = true
    output = '新的译文'
    await vi.advanceTimersByTimeAsync(400)
    await expect(result).resolves.toBe('新的译文')
  })
  it('never accepts unchanged output even with matching input', async() => {
    vi.useFakeTimers()
    const result = waitForTranslation({
      source: 'new',
      signal: new AbortController().signal,
      timeoutMs: 600,
      read: async() => ({ input: 'new', output: '上一句的译文', changed: false })
    })
    await vi.advanceTimersByTimeAsync(600)
    await expect(result).resolves.toBeNull()
  })
  it.each(['上一句的译文 ...', '上一句的译文…'])(
    'rejects a Chinese loading placeholder: %s',
    async(output) => {
      vi.useFakeTimers()
      const result = waitForTranslation({
        source: 'new',
        signal: new AbortController().signal,
        timeoutMs: 600,
        read: async() => ({ input: 'new', output, changed: true })
      })
      await vi.advanceTimersByTimeAsync(600)
      await expect(result).resolves.toBeNull()
    }
  )
  it('preserves intentional ellipses in the source', async() => {
    vi.useFakeTimers()
    const result = waitForTranslation({
      source: 'And then...',
      signal: new AbortController().signal,
      read: async() => ({ input: 'And then...', output: '然后……', changed: true })
    })
    await vi.advanceTimersByTimeAsync(250)
    await expect(result).resolves.toBe('然后……')
  })
  it('previews a current result immediately but waits while its region is busy', async() => {
    vi.useFakeTimers()
    let complete = false
    const onPreview = vi.fn()
    const finished = vi.fn()
    const result = waitForTranslation({ source: 'new', signal: new AbortController().signal,
      read: async() => ({ input: 'new', output: '新的译文', changed: true, complete }), onPreview })
    void result.then(finished)
    await vi.advanceTimersByTimeAsync(0)
    expect(onPreview).toHaveBeenCalledWith('新的译文')
    await vi.advanceTimersByTimeAsync(400)
    expect(finished).not.toHaveBeenCalled()
    expect(onPreview).toHaveBeenCalledTimes(1)
    complete = true
    await vi.advanceTimersByTimeAsync(100)
    await expect(result).resolves.toBe('新的译文')
  })
  it('does not preview another source or a previous result placeholder', async() => {
    vi.useFakeTimers()
    const onPreview = vi.fn()
    const result = waitForTranslation({ source: 'new', signal: new AbortController().signal, timeoutMs: 600,
      read: async() => ({ input: Date.now() % 200 ? 'new' : 'previous', output: '旧译文 ...', changed: true }), onPreview })
    await vi.advanceTimersByTimeAsync(600)
    await expect(result).resolves.toBeNull()
    expect(onPreview).not.toHaveBeenCalled()
  })
  it('cancels the polling sleep immediately', async() => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const result = waitForTranslation({
      source: 'new',
      signal: controller.signal,
      read: async() => null
    })
    await vi.advanceTimersByTimeAsync(0)
    controller.abort()
    await expect(result).resolves.toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })
  it.each(['prepare', 'read'] as const)('times out even when %s never resolves', async(stage) => {
    vi.useFakeTimers()
    const hung = () => new Promise<never>(() => {})
    const result = waitForTranslation({
      source: 'new',
      signal: new AbortController().signal,
      timeoutMs: 600,
      prepare: stage === 'prepare' ? hung : undefined,
      read: stage === 'read' ? hung : async() => null
    })
    await vi.advanceTimersByTimeAsync(600)
    await expect(result).resolves.toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })
  it('cancels even when a DOM operation never resolves', async() => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const result = waitForTranslation({
      source: 'new',
      signal: controller.signal,
      read: () => new Promise(() => {})
    })
    await vi.advanceTimersByTimeAsync(0)
    controller.abort()
    await expect(result).resolves.toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })
  it('uses one overall deadline and does not accept error or empty result text', async() => {
    vi.useFakeTimers()
    const result = waitForTranslation({
      source: 'new',
      signal: new AbortController().signal,
      timeoutMs: 600,
      read: async() => ({ input: 'new', output: 'Loading...', changed: true })
    })
    await vi.advanceTimersByTimeAsync(600)
    await expect(result).resolves.toBeNull()
  })
})
