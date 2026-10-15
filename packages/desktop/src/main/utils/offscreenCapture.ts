import type { BrowserWindow, NativeImage, Rectangle, Event } from 'electron'

/** A compositor paint, rather than a DOM animation frame, makes the resized surface ready. */
export const captureOffscreenFrame = (win: BrowserWindow, rect: Rectangle): Promise<NativeImage> =>
  new Promise((resolve, reject) => {
    const contents = win.webContents
    const cleanup = () => {
      clearTimeout(timer)
      contents.removeListener('paint', onPaint)
      contents.removeListener('destroyed', onDestroyed)
    }
    const onDestroyed = () => {
      cleanup()
      reject(new Error('导出窗口已关闭'))
    }
    const onPaint = (_event: Event, _dirty: Rectangle, image: NativeImage) => {
      const size = image.getSize()
      if (image.isEmpty() || size.width < rect.x + rect.width || size.height < rect.y + rect.height)
        return
      cleanup()
      resolve(image.crop(rect))
    }
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error('等待公式绘制超时'))
    }, 15000)
    contents.on('paint', onPaint)
    contents.once('destroyed', onDestroyed)
    const [width, height] = win.getContentSize()
    win.setContentSize(Math.max(width, rect.x + rect.width), Math.max(height, rect.y + rect.height))
    contents.invalidate()
  })
