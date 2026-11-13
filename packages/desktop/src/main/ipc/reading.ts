import { ipcMain } from 'electron'
import { ReadingViews } from '../windows/readingView'
import { readVocabulary } from '../utils/readingDictionary'
import { isReadingId, isTranslationProvider, isTranslationRequest } from '../utils/readingWeb'
import type { ReadingViewBounds, TranslationProvider } from '../../shared/types/reading'

export const registerReadingHandlers = (): void => {
  const views = new ReadingViews()
  ipcMain.handle('mt::reading::vocabulary', (_event, source: unknown, domain: unknown) =>
    readVocabulary(source, domain)
  )
  ipcMain.handle('mt::reading::translate', (event, id: unknown, request: unknown) => {
    if (!isReadingId(id) || !isTranslationRequest(request))
      return {
        ok: false,
        error:
          '在线原文限 5,000 字符，请选择较短段落。 / Online source limit: 5,000 characters. Select a shorter passage.'
      }
    return views.translate(event.sender, id, request)
  })
  ipcMain.handle(
    'mt::reading::open-web',
    (event, id: string, provider: TranslationProvider, bounds: ReadingViewBounds) => {
      if (!isReadingId(id) || !isTranslationProvider(provider))
        return { ok: false, error: 'Invalid reading view.' }
      return views.open(event.sender, id, provider, bounds)
    }
  )
  ipcMain.handle('mt::reading::web-layout', (event, id: string, bounds: ReadingViewBounds | null) =>
    views.layout(event.sender, id, bounds)
  )
  ipcMain.handle('mt::reading::cancel', (event, id: string) => views.cancel(event.sender, id))
  ipcMain.handle('mt::reading::close-web', (event, id: string) => views.close(event.sender, id))
}
