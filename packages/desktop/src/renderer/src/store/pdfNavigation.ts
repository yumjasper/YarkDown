import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import type { PDFDocumentProxy } from 'pdfjs-dist'

// PDF.js instances stay outside the persisted editor buffer and Vue's deep proxies.
export const usePdfNavigationStore = defineStore('pdfNavigation', () => {
  const fileId = ref('')
  const document = shallowRef<PDFDocumentProxy>()
  const currentPage = ref(1)
  let navigatePage: ((page: number) => void) | undefined
  let navigateDestination: ((destination: string | unknown[]) => void | Promise<void>) | undefined
  const attach = (id: string, pdf: PDFDocumentProxy, page: number, goTo: typeof navigatePage, destination: typeof navigateDestination) => {
    fileId.value = id
    document.value = pdf
    currentPage.value = page
    navigatePage = goTo
    navigateDestination = destination
  }
  const clear = (id: string) => {
    if (fileId.value !== id) return
    document.value = undefined
    fileId.value = ''
    navigatePage = undefined
    navigateDestination = undefined
  }
  const setPage = (id: string, page: number) => { if (fileId.value === id) currentPage.value = page }
  const goTo = (page: number) => navigatePage?.(page)
  const goToDestination = async(destination: string | unknown[]) => { await navigateDestination?.(destination) }
  return { fileId, document, currentPage, attach, clear, setPage, goTo, goToDestination }
})
