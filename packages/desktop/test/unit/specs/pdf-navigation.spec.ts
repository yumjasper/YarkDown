import { expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { usePdfNavigationStore } from '../../../src/renderer/src/store/pdfNavigation'

it('keeps PDF.js raw and rejects stale page updates or cleanup after switching documents', () => {
  setActivePinia(createPinia())
  const store = usePdfNavigationStore()
  const first = {} as PDFDocumentProxy, second = {} as PDFDocumentProxy
  const goTo = vi.fn(), destination = vi.fn()
  store.attach('first', first, 1, vi.fn(), vi.fn())
  store.attach('second', second, 8, goTo, destination)
  store.clear('first')
  store.setPage('first', 100)
  expect(store.document).toBe(second)
  expect(store.currentPage).toBe(8)
  store.goTo(12)
  store.goToDestination('chapter-2')
  expect(goTo).toHaveBeenCalledWith(12)
  expect(destination).toHaveBeenCalledWith('chapter-2')
  store.clear('second')
  store.goTo(5)
  expect(goTo).toHaveBeenCalledTimes(1)
  expect(store.document).toBeUndefined()
})
