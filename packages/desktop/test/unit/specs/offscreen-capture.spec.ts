import { EventEmitter } from 'node:events'
import type { BrowserWindow, NativeImage } from 'electron'
import { afterEach, expect, it, vi } from 'vitest'
import { captureOffscreenFrame } from '../../../src/main/utils/offscreenCapture'

afterEach(() => vi.useRealTimers())

const fixture = () => {
  const contents = Object.assign(new EventEmitter(), { invalidate: vi.fn() })
  const win = { webContents: contents, getContentSize: () => [100, 100], setContentSize: vi.fn() }
  return { contents, win: win as unknown as BrowserWindow }
}

it('ignores the old compositor surface and crops only a sufficiently large painted frame', async() => {
  const { contents, win } = fixture()
  const rect = { x: 0, y: 0, width: 1204, height: 82 }
  let ready = false
  const result = captureOffscreenFrame(win, rect).then(image => { ready = true; return image })
  const crop = vi.fn(() => 'cropped')
  contents.emit('paint', {}, rect, { isEmpty: () => false, getSize: () => ({ width: 100, height: 100 }), crop })
  await Promise.resolve()
  expect(ready).toBe(false)
  contents.emit('paint', {}, rect, { isEmpty: () => false, getSize: () => ({ width: 1280, height: 512 }), crop } as unknown as NativeImage)
  expect(await result).toBe('cropped')
  expect(crop).toHaveBeenCalledWith(rect)
  expect(contents.listenerCount('paint')).toBe(0)
  expect(contents.listenerCount('destroyed')).toBe(0)
})

it('releases compositor listeners when painting times out', async() => {
  vi.useFakeTimers()
  const { contents, win } = fixture()
  const result = captureOffscreenFrame(win, { x: 0, y: 0, width: 20, height: 20 })
  const rejected = expect(result).rejects.toThrow('等待公式绘制超时')
  await vi.advanceTimersByTimeAsync(15000)
  await rejected
  expect(contents.listenerCount('paint')).toBe(0)
  expect(contents.listenerCount('destroyed')).toBe(0)
})
