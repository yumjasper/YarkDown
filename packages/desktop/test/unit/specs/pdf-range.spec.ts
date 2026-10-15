import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { EventEmitter } from 'node:events'
import { createHash } from 'node:crypto'
import path from 'node:path'
import type { IpcInvokeChannels } from '../../../src/shared/types/ipc'

const handlers = vi.hoisted(() => new Map<string, (...args: unknown[]) => Promise<unknown>>())
vi.mock('electron', () => ({
  app: { isPackaged: false },
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => Promise<unknown>) =>
      handlers.set(channel, handler)
  },
  BrowserWindow: {},
  dialog: {}
}))
vi.mock('../../../src/main/filesystem', () => ({ writeFile: vi.fn() }))
import { registerPdfHandlers } from '../../../src/main/ipc/pdf'
registerPdfHandlers()

const directories: string[] = []
const senders: Array<EventEmitter & { id: number }> = []
let owner = 0
const sender = () => {
  const source = Object.assign(new EventEmitter(), { id: ++owner })
  senders.push(source)
  return source
}
const invoke = async <K extends keyof IpcInvokeChannels>(
  source: ReturnType<typeof sender>,
  channel: K,
  ...args: IpcInvokeChannels[K]['args']
): Promise<IpcInvokeChannels[K]['ret']> => {
  const handler = handlers.get(channel)
  if (!handler) throw new Error(`Missing handler ${channel}`)
  return (await handler({ sender: source }, ...args)) as IpcInvokeChannels[K]['ret']
}
const fixture = async() => {
  const directory = await mkdtemp(path.join(tmpdir(), 'yarktext-pdf-range-'))
  directories.push(directory)
  const filename = path.join(directory, '中文 # reader.pdf')
  const bytes = Buffer.alloc(1024 * 1024, 0x61)
  bytes.write('%PDF-1.7\n')
  await writeFile(filename, bytes)
  return { filename, bytes }
}
afterEach(async() => {
  senders.splice(0).forEach((source) => source.emit('destroyed'))
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
  )
})

describe('PDF range reading', () => {
  it('reads bounded ranges, hashes the source and releases Windows replacement locks', async() => {
    const { filename, bytes } = await fixture()
    const source = sender()
    const session = await invoke(source, 'mt::pdf::open', filename)
    expect(session.size).toBe(bytes.length)
    expect(Buffer.from(await invoke(source, 'mt::pdf::read-range', session.token, 0, 257))).toEqual(
      bytes.subarray(0, 257)
    )
    expect(await invoke(source, 'mt::pdf::hash', session.token)).toBe(
      createHash('sha256').update(bytes).digest('hex')
    )
    const replacement = filename + '.replacement'
    await writeFile(replacement, 'replacement')
    await rename(replacement, filename)
    expect(await readFile(filename, 'utf8')).toBe('replacement')
    await expect(invoke(source, 'mt::pdf::read-range', session.token, 0, 10)).rejects.toThrow(
      'changed on disk'
    )
  })

  it('rejects cross-window access, invalid ranges, non-PDF files and expired sessions', async() => {
    const { filename } = await fixture()
    const source = sender(),
      other = sender()
    const { token } = await invoke(source, 'mt::pdf::open', filename)
    await expect(invoke(other, 'mt::pdf::read-range', token, 0, 10)).rejects.toThrow('expired')
    for (const [begin, end] of [
      [-1, 10],
      [10, 10],
      [0, 9 * 1024 * 1024],
      [0.5, 20]
    ]) {
      await expect(invoke(source, 'mt::pdf::read-range', token, begin, end)).rejects.toThrow(
        'Invalid PDF byte range'
      )
    }
    await expect(invoke(source, 'mt::pdf::open', filename + '.txt')).rejects.toThrow(
      'Invalid PDF path'
    )
    await invoke(source, 'mt::pdf::close', token)
    await expect(invoke(source, 'mt::pdf::hash', token)).rejects.toThrow('expired')
    const second = await invoke(source, 'mt::pdf::open', filename)
    source.emit('destroyed')
    await expect(invoke(source, 'mt::pdf::read-range', second.token, 0, 10)).rejects.toThrow(
      'expired'
    )
  })
})
