import { stat } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'

export const assertPdfWritable = async(pathname: string): Promise<void> => {
  try {
    const info = await stat(pathname)
    // Node maps the Windows read-only attribute to absent write permission bits.
    if (!(info.mode & 0o222))
      throw Object.assign(new Error('PDF destination is read-only.'), { code: 'EPDFREADONLY' })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}

export const writePdfWithRetry = async(
  write: () => Promise<void>,
  verify: () => Promise<void>,
  windows = process.platform === 'win32',
  wait: (ms: number) => Promise<unknown> = delay
): Promise<void> => {
  const delays = windows ? [150, 300, 600, 1000] : []
  for (let attempt = 0; ; attempt++) {
    await verify()
    try {
      await write()
      return
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (attempt >= delays.length || !['EPERM', 'EACCES', 'EBUSY'].includes(code || '')) throw error
      // Antivirus and preview handlers can retain a replacement handle beyond the generic writer's short backoff.
      await wait(delays[attempt])
    }
  }
}
