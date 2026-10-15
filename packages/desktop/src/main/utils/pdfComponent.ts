import { existsSync } from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

export const isPdfReaderInstalled = (): boolean => !app.isPackaged || !existsSync(path.join(process.resourcesPath, 'pdf-disabled'))

export const requirePdfReader = (): void => {
  if (!isPdfReaderInstalled()) throw new Error('未安装 PDF 阅读器。请重新运行 YarkText 安装程序并勾选“同时安装 PDF 阅读器”。 / Re-run the installer and select the PDF reader component.')
}
