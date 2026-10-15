import { open, readFile, stat } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import path from 'node:path'
import { BrowserWindow, dialog, ipcMain } from 'electron'
import { isPdfFile, type PdfSaveRequest, type PdfSaveResult } from '@shared/pdf'
import { requirePdfReader } from '../utils/pdfComponent'
import { writeFile } from '../filesystem'

const pendingSaves = new Map<string, Promise<PdfSaveResult>>()
const pendingReads = new Map<string, Set<Promise<void>>>()
const pathKey = (pathname: string) =>
  process.platform === 'win32' ? path.resolve(pathname).toLowerCase() : path.resolve(pathname)

const withPdfRead = async <T>(session: PdfSession, read: () => Promise<T>): Promise<T> => {
  const key = pathKey(session.pathname)
  while (pendingSaves.has(key)) await pendingSaves.get(key)?.catch(() => null)
  let release!: () => void
  const lease = new Promise<void>((resolve) => {
    release = resolve
  })
  const reads = pendingReads.get(key) || new Set<Promise<void>>()
  reads.add(lease)
  pendingReads.set(key, reads)
  try {
    return await read()
  } finally {
    reads.delete(lease)
    if (!reads.size) pendingReads.delete(key)
    release()
  }
}

interface PdfSession {
  owner: number
  pathname: string
  inode: number
  size: number
  mtime: number
  closed: boolean
}
const sessions = new Map<string, PdfSession>()
const sessionOwners = new Set<number>()
const closeSession = async(token: string) => {
  const session = sessions.get(token)
  if (!session) return
  sessions.delete(token)
  session.closed = true
}
const getSession = (token: string, owner: number) => {
  const session = sessions.get(token)
  if (!session || session.owner !== owner || session.closed)
    throw new Error('PDF reading session expired.')
  return session
}
const verifySession = async(session: PdfSession) => {
  const current = await stat(session.pathname)
  if (
    session.closed ||
    current.size !== session.size ||
    current.mtimeMs !== session.mtime ||
    current.ino !== session.inode
  ) {
    throw new Error('PDF changed on disk. Reload the document before continuing.')
  }
}

export const registerPdfHandlers = (): void => {
  ipcMain.handle('mt::pdf::print', async(event, pathname: string) => {
    requirePdfReader()
    const parent = BrowserWindow.fromWebContents(event.sender)
    if (!parent || typeof pathname !== 'string' || !isPdfFile(pathname))
      throw new Error('Invalid PDF print request.')
    const printWindow = new BrowserWindow({
      show: false,
      parent,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        plugins: true
      }
    })
    printWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    try {
      const loaded = new Promise<void>((resolve) =>
        printWindow.webContents.once('did-stop-loading', () => resolve())
      )
      await printWindow.loadFile(pathname)
      await loaded
      await new Promise<void>((resolve, reject) =>
        printWindow.webContents.print(
          { silent: false, printBackground: true },
          (success, reason) => {
            if (success || /cancel/i.test(reason)) resolve()
            else reject(new Error(reason || 'PDF printing failed.'))
          }
        )
      )
    } finally {
      if (!printWindow.isDestroyed()) printWindow.destroy()
    }
  })
  ipcMain.handle('mt::pdf::open', async(event, pathname: string) => {
    requirePdfReader()
    if (typeof pathname !== 'string' || !isPdfFile(pathname)) throw new Error('Invalid PDF path.')
    const info = await stat(pathname)
    if (!info.isFile() || !info.size) throw new Error('PDF file is empty or unavailable.')
    const token = randomUUID()
    sessions.set(token, {
      owner: event.sender.id,
      pathname,
      inode: info.ino,
      size: info.size,
      mtime: info.mtimeMs,
      closed: false
    })
    if (!sessionOwners.has(event.sender.id)) {
      const owner = event.sender.id
      sessionOwners.add(owner)
      event.sender.once('destroyed', () => {
        sessionOwners.delete(owner)
        for (const [key, session] of sessions)
          if (session.owner === owner) void closeSession(key).catch(() => {})
      })
    }
    return { token, size: info.size }
  })
  ipcMain.handle(
    'mt::pdf::read-range',
    async(event, token: string, begin: number, end: number) => {
      const session = getSession(token, event.sender.id)
      if (
        !Number.isSafeInteger(begin) ||
        !Number.isSafeInteger(end) ||
        begin < 0 ||
        end <= begin ||
        end > session.size ||
        end - begin > 8 * 1024 * 1024
      )
        throw new Error('Invalid PDF byte range.')
      return withPdfRead(session, async() => {
        await verifySession(session)
        const buffer = Buffer.allocUnsafe(end - begin)
        // Release each read handle before returning: Windows atomic saves cannot replace an open file.
        const file = await open(session.pathname, 'r')
        try {
          let offset = 0
          while (offset < buffer.length) {
            const { bytesRead } = await file.read(
              buffer,
              offset,
              buffer.length - offset,
              begin + offset
            )
            if (!bytesRead) throw new Error('Incomplete PDF read. Reload the document.')
            offset += bytesRead
          }
          await verifySession(session)
        } finally {
          await file.close()
        }
        return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
      })
    }
  )
  ipcMain.handle('mt::pdf::hash', async(event, token: string) => {
    const session = getSession(token, event.sender.id)
    return withPdfRead(session, async() => {
      await verifySession(session)
      const hash = createHash('sha256')
      for await (const chunk of createReadStream(session.pathname, {
        highWaterMark: 1024 * 1024
      })) {
        if (session.closed) throw new Error('PDF reading session expired.')
        hash.update(chunk)
      }
      await verifySession(session)
      return hash.digest('hex')
    })
  })
  ipcMain.handle('mt::pdf::close', async(event, token: string) => {
    getSession(token, event.sender.id)
    await closeSession(token)
  })
  ipcMain.handle('mt::pdf::save', async(event, request: PdfSaveRequest) => {
    requirePdfReader()
    const { annotatePdf, pdfHash } = await import('../utils/pdfAnnotations')
    if (!request || !isPdfFile(request.pathname) || !/^[a-f\d]{64}$/.test(request.sourceHash))
      throw new Error('Invalid PDF save request.')
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) throw new Error('PDF window is unavailable.')
    const key = pathKey(request.pathname)
    const previous = pendingSaves.get(key)
    const save = (async() => {
      await previous?.catch(() => null)
      // Windows replacement requires all of our range/hash handles to have closed.
      await Promise.all(pendingReads.get(key) || [])
      const source = await readFile(request.pathname)
      if (pdfHash(source) !== request.sourceHash)
        throw new Error(
          'PDF changed on disk. Save is blocked to protect external edits. Reload before annotating again.'
        )
      let destination = request.pathname
      if (request.copy) {
        const parsed = path.parse(request.pathname)
        const result = await dialog.showSaveDialog(win, {
          defaultPath: path.join(parsed.dir, `${parsed.name}_annotated.pdf`),
          filters: [{ name: 'PDF', extensions: ['pdf'] }]
        })
        if (result.canceled || !result.filePath) return null
        destination = /\.pdf$/i.test(result.filePath) ? result.filePath : `${result.filePath}.pdf`
      }
      const annotated = request.annotations.length
        ? await annotatePdf(source, request.annotations)
        : source
      if (pdfHash(await readFile(request.pathname)) !== request.sourceHash)
        throw new Error('PDF changed during save. Reload before trying again.')
      try {
        await writeFile(destination, Buffer.from(annotated), undefined, undefined)
      } catch (error) {
        if (!['EPERM', 'EACCES', 'EBUSY'].includes((error as NodeJS.ErrnoException).code || ''))
          throw error
        const { response } = await dialog.showMessageBox(win, {
          type: 'warning',
          message: 'PDF 文件被占用或没有写入权限 / PDF file is locked or not writable',
          detail:
            '请关闭正在预览此文件的软件后重试，或将批注另存为副本。原文件和未保存的批注草稿均会保留。\nClose other PDF viewers and retry, or save an annotated copy. Your original and drafts are retained.',
          buttons: ['另存为副本 / Save a copy', '取消 / Cancel'],
          defaultId: 0,
          cancelId: 1,
          noLink: true
        })
        if (response !== 0) return null
        const parsed = path.parse(destination)
        const result = await dialog.showSaveDialog(win, {
          defaultPath: path.join(parsed.dir, `${parsed.name}_annotated.pdf`),
          filters: [{ name: 'PDF', extensions: ['pdf'] }]
        })
        if (result.canceled || !result.filePath) return null
        const copyPath = /\.pdf$/i.test(result.filePath)
          ? result.filePath
          : `${result.filePath}.pdf`
        if (pathKey(copyPath) === pathKey(destination) || pathKey(copyPath) === key)
          throw new Error(
            '请选择新的副本文件名，原文件仍被占用。 / Choose a different name for the PDF copy.',
            { cause: error }
          )
        destination = copyPath
        await writeFile(destination, Buffer.from(annotated), undefined, undefined)
      }
      ipcMain.emit('window-file-saved', win.id, destination)
      return { pathname: destination, hash: pdfHash(annotated) }
    })()
    pendingSaves.set(key, save)
    try {
      return await save
    } finally {
      if (pendingSaves.get(key) === save) pendingSaves.delete(key)
    }
  })
  ipcMain.handle('mt::pdf::confirm-close', async(event, filename: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return 'cancel'
    const { response } = await dialog.showMessageBox(win, {
      type: 'question',
      message: `保存 PDF 批注？ / Save PDF annotations?\n${path.basename(filename)}`,
      buttons: ['保存 / Save', '不保存 / Discard', '取消 / Cancel'],
      defaultId: 0,
      cancelId: 2,
      noLink: true
    })
    return ['save', 'discard', 'cancel'][response] || 'cancel'
  })
}
