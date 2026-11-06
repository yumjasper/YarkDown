import { beforeEach, describe, expect, it, vi } from 'vitest'

// `menu/actions/file.ts` registers its handlers on `ipcMain` at import time, so
// the export handler is captured here and driven directly.
const { handlers, showSaveDialog, fromWebContents, sent, printToPDF, pdfBytes } = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  showSaveDialog: vi.fn(),
  fromWebContents: vi.fn(),
  sent: [] as Array<{ channel: string, payload: Record<string, unknown> }>,
  printToPDF: vi.fn(),
  pdfBytes: Buffer.from('%PDF-1.4 fake')
}))

vi.mock('electron', () => ({
  ipcMain: {
    on: (channel: string, listener: (...args: unknown[]) => unknown) => {
      handlers.set(channel, listener)
    },
    handle: () => {},
    emit: () => {}
  },
  dialog: { showSaveDialog },
  BrowserWindow: { fromWebContents, getAllWindows: () => [] },
  shell: { openExternal: vi.fn(), openPath: vi.fn() },
  app: { getPath: () => '/tmp', getVersion: () => '0.0.0' }
}))

vi.mock('electron-log', () => ({ default: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))
vi.mock('electron-updater', () => ({ autoUpdater: { on: vi.fn(), checkForUpdates: vi.fn() } }))
// `main/filesystem` reaches the native `ced` addon, built for Electron's ABI.
vi.mock('ced', () => ({ default: () => 'UTF-8' }))
vi.mock('main_renderer/i18n', () => ({
  t: (key: string) => key,
  getCurrentLanguage: () => 'en'
}))

await import('main_renderer/menu/actions/file')

const FAKE_WIN = {
  id: 1,
  isDestroyed: () => false,
  webContents: {
    printToPDF,
    send: (channel: string, payload: Record<string, unknown>) => {
      sent.push({ channel, payload })
    }
  }
}

const exportPdfWith = async(pageOptions: Record<string, unknown>): Promise<void> => {
  const handler = handlers.get('mt::response-export')
  if (!handler) throw new Error('mt::response-export handler was not registered')
  await handler({ sender: {} } as never, {
    type: 'pdf',
    content: '<article></article>',
    pathname: '/docs/notes.md',
    title: 'Notes',
    pageOptions
  })
}

/** The options `printToPDF` was last called with. */
const lastPrintOptions = (): Record<string, unknown> =>
  printToPDF.mock.calls.at(-1)?.[0] as Record<string, unknown>

const pageSizeOfLastPrint = (): { width: number, height: number } =>
  lastPrintOptions().pageSize as { width: number, height: number }

const MM_PER_INCH = 25.4

// Electron's printToPDF takes custom page dimensions in inches. The settings UI
// works in millimetres, and passing millimetres (or the older microns) makes
// Chromium reject the job outright with "Printing failed" — which is exactly what
// broke both the adaptive page size and the custom page size.
describe('PDF export page size units', () => {
  beforeEach(() => {
    sent.length = 0
    showSaveDialog.mockReset()
    fromWebContents.mockReset()
    printToPDF.mockReset()

    showSaveDialog.mockResolvedValue({ filePath: '/out/notes.pdf', canceled: false })
    fromWebContents.mockReturnValue(FAKE_WIN)
    printToPDF.mockResolvedValue(pdfBytes)
  })

  it('converts a custom page size from millimetres to inches', async() => {
    await exportPdfWith({
      pageSize: 'custom',
      pageSizeWidth: 210,
      pageSizeHeight: 297,
      isLandscape: false
    })

    const { width, height } = pageSizeOfLastPrint()
    expect(width).toBeCloseTo(210 / MM_PER_INCH, 6)
    expect(height).toBeCloseTo(297 / MM_PER_INCH, 6)
  })

  // The adaptive export hands over the measured document height: a tall value
  // that only overflowed Chromium's limit because the unit was wrong.
  it('converts an adaptive (very tall) page height to inches', async() => {
    await exportPdfWith({
      pageSize: 'custom',
      pageSizeWidth: 210,
      pageSizeHeight: 5460,
      isLandscape: false
    })

    const { height } = pageSizeOfLastPrint()
    expect(height).toBeCloseTo(5460 / MM_PER_INCH, 6)
    expect(height).toBeLessThan(300)
  })

  it('keeps named page sizes untouched and still passes the orientation', async() => {
    await exportPdfWith({ pageSize: 'A4', isLandscape: true })

    expect(lastPrintOptions()).toMatchObject({ pageSize: 'A4', landscape: true })
  })

  it('defaults to no page size when the renderer sends none', async() => {
    await exportPdfWith({})

    expect(lastPrintOptions().pageSize).toBeUndefined()
  })

  it('reports success after a PDF is written', async() => {
    await exportPdfWith({
      pageSize: 'custom',
      pageSizeWidth: 210,
      pageSizeHeight: 297,
      isLandscape: false
    })

    const channels = sent.map((s) => s.channel)
    expect(channels).toContain('mt::export-success')
    expect(channels.at(-1)).toBe('mt::export-finished')
  })
})
