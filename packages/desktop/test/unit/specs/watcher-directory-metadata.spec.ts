import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ load: vi.fn(), stat: vi.fn(), watch: vi.fn() }))
vi.mock('chokidar', () => ({ default: { watch: mocks.watch } }))
vi.mock('fs/promises', () => ({ default: { stat: mocks.stat } }))
vi.mock('main_renderer/filesystem/markdown', () => ({ loadMarkdownFile: mocks.load }))
import Watcher from 'main_renderer/filesystem/watcher'

describe('directory enumeration memory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.stat.mockResolvedValue({ birthtime: new Date(0), mtimeMs: 1 })
    mocks.load.mockResolvedValue({ markdown: 'file content' })
  })

  const start = (type: 'dir' | 'file') => {
    const emitter = Object.assign(new EventEmitter(), { close: vi.fn() })
    mocks.watch.mockReturnValue(emitter)
    const send = vi.fn()
    const watcher = new Watcher({ getItem: () => false, getPreferredEol: () => 'lf', getAll: () => ({}) } as never)
    watcher.watch({ id: 1, webContents: { send } } as never, '/project', type)
    return { emitter, send, watcher }
  }

  it('lists unopened documents without reading or transferring their text', async() => {
    const { emitter, send, watcher } = start('dir')
    emitter.emit('add', '/project/unopened.md')
    await vi.waitFor(() => expect(send).toHaveBeenCalledOnce())
    expect(mocks.load).not.toHaveBeenCalled()
    expect(send.mock.calls[0]?.[1].change).toMatchObject({ pathname: '/project/unopened.md', name: 'unopened.md' })
    expect(send.mock.calls[0]?.[1].change.data).toBeUndefined()
    watcher.close()
  })

  it('still reloads content for an explicitly opened document', async() => {
    const { emitter, send, watcher } = start('file')
    emitter.emit('add', '/project/opened.md')
    await vi.waitFor(() => expect(send).toHaveBeenCalledOnce())
    expect(mocks.load).toHaveBeenCalledOnce()
    expect(send.mock.calls[0]?.[1].change.data.markdown).toBe('file content')
    watcher.close()
  })
})
