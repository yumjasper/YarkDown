import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.hoisted(() => {
  Object.assign(window, {
    path: { sep: '/', dirname: (value: string) => value },
    electron: { clipboard: { writeText: vi.fn() }, ipcRenderer: { send: vi.fn(), on: vi.fn(), invoke: vi.fn() } }
  })
})
vi.mock('@/services/notification', () => ({ default: { notify: vi.fn() } }))
vi.mock('@/store/bufferedState', () => ({ debouncedSendBufferedState: vi.fn(), sendBufferedState: vi.fn().mockResolvedValue(true) }))
import { useEditorStore } from '@/store/editor'
import { createDocumentState } from '@/store/help'
import type { PdfAnnotation } from '../../../src/shared/pdf'

const draft: PdfAnnotation = {
  id: 'note-1', kind: 'Text', page: 1, rect: [20, 20, 44, 44], color: '#ffff00', opacity: 1,
  width: 1, text: '未保存的中文评论', author: '评阅者', modified: '2026-10-15T12:00:00Z'
}
const setup = () => {
  const store = useEditorStore()
  store.tabs = [createDocumentState({ filename: 'review.pdf', pathname: 'D:/review.pdf', pdfSourceHash: 'a'.repeat(64) })]
  store.currentFile = store.tabs[0]
  store.updateTabIdToIndex()
  store.SET_PDF_ANNOTATIONS(store.currentFile!.id, [{ ...draft }])
  return { store, file: store.tabs[0]! }
}
describe('PDF drafts and binary save routing', () => {
  beforeEach(() => { setActivePinia(createPinia()); vi.clearAllMocks() })

  it('persists cloneable drafts and restores them without exposing PDF bytes to text editors', () => {
    const { store, file } = setup()
    expect(file.isSaved).toBe(false)
    const state = structuredClone(store.CREATE_BUFFERED_STATE())!
    expect(state.tabs[0].pdfAnnotations?.[0].text).toBe(draft.text)
    const restored = createDocumentState(state.tabs[0])
    expect(restored.pdfSourceHash).toBe('a'.repeat(64))
    expect(restored.pdfAnnotations).toEqual([draft])
    store.LISTEN_FOR_CONTENT_CHANGE({ id: file.id, markdown: 'must not overwrite the PDF' })
    expect(file.markdown).toBe('')
    expect(file.pdfAnnotations).toEqual([draft])
  })

  it('routes saves through the binary handler and retains drafts after conflicts or canceled dialogs', async() => {
    const { store, file } = setup()
    const invoke = vi.mocked(window.electron.ipcRenderer.invoke)
    invoke.mockRejectedValueOnce(new Error('changed on disk'))
    expect(await store.SAVE_PDF(file)).toBe(false)
    expect(file.isSaved).toBe(false)
    expect(file.pdfAnnotations).toEqual([draft])
    invoke.mockResolvedValueOnce(null)
    expect(await store.SAVE_PDF(file, true)).toBe(false)
    expect(file.pdfAnnotations).toEqual([draft])
    invoke.mockResolvedValueOnce({ pathname: file.pathname, hash: 'b'.repeat(64) })
    expect(await store.SAVE_PDF(file)).toBe(true)
    expect(file.isSaved).toBe(true)
    expect(file.pdfSourceHash).toBe('b'.repeat(64))
    expect(file.pdfAnnotations).toEqual([])
    expect(window.electron.ipcRenderer.send).not.toHaveBeenCalled()
  })

  it('keeps canceled closes open and discards drafts only after an explicit discard', async() => {
    const { store, file } = setup()
    const invoke = vi.mocked(window.electron.ipcRenderer.invoke)
    invoke.mockResolvedValueOnce('cancel')
    await store.CLOSE_TAB(file)
    expect(store.tabs).toHaveLength(1)
    expect(file.pdfAnnotations).toEqual([draft])
    invoke.mockResolvedValueOnce('discard')
    await store.CLOSE_TAB(file)
    expect(store.tabs).toHaveLength(0)
    expect(vi.mocked(window.electron.ipcRenderer.send).mock.calls.every(call => call[0] !== 'mt::save-and-close-tabs')).toBe(true)
  })
})
