import { copyFile, mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { BrowserWindow, dialog, ipcMain } from 'electron'
import { isPdfFile, type PdfAdvancedRequest } from '@shared/pdf'
import { requirePdfReader } from '../utils/pdfComponent'
import { writeFile } from '../filesystem'
import { inspectPdfBlocks, pdfEngineCapabilities, runPdfEngine } from '../utils/pdfAdvanced'

const assertInput = async(pathname: string) => {
  if (typeof pathname !== 'string' || !path.isAbsolute(pathname) || !isPdfFile(pathname))
    throw new Error('Invalid PDF input.')
  const info = await stat(pathname)
  if (!info.isFile() || !info.size || info.size > 512 * 1024 * 1024)
    throw new Error('PDF processing accepts files up to 512 MB.')
}

export const registerPdfAdvancedHandlers = () => {
  ipcMain.handle('mt::pdf::engine-capabilities', () => {
    requirePdfReader()
    return pdfEngineCapabilities()
  })
  ipcMain.handle('mt::pdf::inspect-blocks', async(_event, pathname: string, page: number) => {
    requirePdfReader()
    await assertInput(pathname)
    if (!Number.isSafeInteger(page) || page < 1) throw new Error('Invalid PDF page.')
    return inspectPdfBlocks(pathname, page)
  })
  ipcMain.handle('mt::pdf::advanced', async(event, request: PdfAdvancedRequest) => {
    requirePdfReader()
    if (!request || !['edit', 'ocr', 'convert'].includes(request.action))
      throw new Error('Invalid advanced PDF request.')
    await assertInput(request.pathname)
    if (request.action === 'convert' && !['docx', 'xlsx', 'pptx'].includes(request.kind))
      throw new Error('Unsupported Office export.')
    if (
      request.action === 'edit' &&
      (!Number.isSafeInteger(request.page) ||
        request.page < 1 ||
        !Number.isSafeInteger(request.blockId) ||
        request.blockId < 0 ||
        typeof request.text !== 'string' ||
        request.text.length > 20000 ||
        !Number.isFinite(request.fontSize) ||
        request.fontSize < 4 ||
        request.fontSize > 96 ||
        !/^[a-f\d]{64}$/.test(request.sourceHash))
    )
      throw new Error('Invalid text block edit.')
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) throw new Error('PDF window is unavailable.')
    const extension = request.action === 'convert' ? request.kind : 'pdf'
    const parsed = path.parse(request.pathname)
    const save = await dialog.showSaveDialog(win, {
      defaultPath: path.join(parsed.dir, `${parsed.name}_${request.action}.${extension}`),
      filters: [{ name: extension.toUpperCase(), extensions: [extension] }]
    })
    if (save.canceled || !save.filePath) return null
    const destination = save.filePath.toLowerCase().endsWith(`.${extension}`)
      ? save.filePath
      : `${save.filePath}.${extension}`
    if (path.resolve(destination).toLowerCase() === path.resolve(request.pathname).toLowerCase())
      throw new Error('请选择新的输出文件名。 / Choose a new output filename.')
    const workspace = await mkdtemp(path.join(tmpdir(), 'yarktext-pdf-'))
    try {
      const input = path.join(workspace, 'input.pdf')
      const output = path.join(workspace, `output.${extension}`)
      await copyFile(request.pathname, input)
      const result = await runPdfEngine<{ message: string }>({ ...request, input, output })
      const bytes = await readFile(output)
      if (!bytes.length) throw new Error('PDF engine generated an empty output.')
      await writeFile(destination, bytes, undefined, undefined)
      return { pathname: destination, message: result.message }
    } finally {
      await rm(workspace, { recursive: true, force: true })
    }
  })
}
