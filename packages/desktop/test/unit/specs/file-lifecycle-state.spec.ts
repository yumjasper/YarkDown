import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.hoisted(async() => {
  const path = await import('node:path')
  Object.assign(window, {
    path: path.posix,
    fileUtils: { isSamePathSync: (a: string, b: string) => a === b },
    electron: { ipcRenderer: { on: vi.fn(), send: vi.fn() } }
  })
})
vi.mock('@/services/notification', () => ({ default: { notify: vi.fn() } }))
vi.mock('@/store/bufferedState', () => ({ debouncedSendBufferedState: vi.fn() }))

import { useEditorStore } from '@/store/editor'
import { createDocumentState, getBlankFileState } from '@/store/help'

describe('file lifecycle state', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('prompts for a new document containing imported text, while an empty tab is clean', () => {
    expect(getBlankFileState([], 'utf8', 'lf', 'imported content').isSaved).toBe(false)
    expect(getBlankFileState([], 'utf8', 'lf', '').isSaved).toBe(true)
  })

  it('keeps a recovered draft dirty when its initial editor history is published', () => {
    const store = useEditorStore()
    const tab = createDocumentState({ filename: 'draft.txt', markdown: 'recovered', isSaved: false })
    store.tabs = [tab]
    store.updateTabIdToIndex()
    store.LISTEN_FOR_CONTENT_CHANGE({
      id: tab.id, markdown: 'recovered',
      history: { stack: [{ id: 0 }], index: 0, lastEditIndex: 0, lastInitIndex: -1 }
    })
    expect(store.tabs[0]?.isSaved).toBe(false)
  })

  it('does not treat a rename acknowledgement as a successful save', () => {
    const store = useEditorStore()
    const tab = createDocumentState({ filename: 'old.txt', pathname: '/old.txt', isSaved: false })
    store.tabs = [tab]
    store.currentFile = store.tabs[0] ?? null
    store.LISTEN_FOR_SET_PATHNAME()
    const on = window.electron.ipcRenderer.on as Mock
    const handler = on.mock.calls.find(call => call[0] === 'mt::set-pathname')?.[1]
    expect(handler).toBeTypeOf('function')
    handler?.(null, { id: tab.id, pathname: '/renamed.txt', filename: 'renamed.txt' })
    expect(store.currentFile?.filename).toBe('renamed.txt')
    expect(store.currentFile?.isSaved).toBe(false)
  })

  it('keeps edits made after a save request dirty until their own acknowledgement', () => {
    const store = useEditorStore()
    const tab = createDocumentState({ markdown: 'newer edit', isSaved: false })
    store.tabs = [tab]
    store.MARK_TAB_SAVED(tab.id, 'older edit')
    expect(store.tabs[0]?.isSaved).toBe(false)
    store.MARK_TAB_SAVED(tab.id, 'newer edit')
    expect(store.tabs[0]?.isSaved).toBe(true)
  })

  it('updates open descendants of a renamed folder without touching siblings', () => {
    const store = useEditorStore()
    store.tabs = [
      createDocumentState({ pathname: '/docs/a/note.md', filename: 'note.md', isSaved: false }),
      createDocumentState({ pathname: '/docs/another/note.md', filename: 'note.md' })
    ]
    store.currentFile = store.tabs[0] ?? null
    store.RENAME_IF_NEEDED({ src: '/docs/a', dest: '/docs/renamed' })
    expect(store.currentFile?.pathname).toBe('/docs/renamed/note.md')
    expect(store.currentFile?.isSaved).toBe(false)
    expect(store.tabs[1]?.pathname).toBe('/docs/another/note.md')
    expect(window.DIRNAME).toBe('/docs/renamed')
  })
})
