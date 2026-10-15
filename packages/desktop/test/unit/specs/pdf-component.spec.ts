import { expect, it, vi } from 'vitest'
import { existsSync } from 'node:fs'
import { app } from 'electron'
vi.mock('electron', () => ({ app: { isPackaged: true } }))
vi.mock('node:fs', () => { const existsSync = vi.fn(); return { existsSync, default: { existsSync } } })
import { isPdfReaderInstalled, requirePdfReader } from '../../../src/main/utils/pdfComponent'

it('blocks PDF when the installer disabled the component, and keeps developer builds enabled', () => {
  vi.stubGlobal('process', { ...process, resourcesPath: 'C:/YarkText/resources' })
  vi.mocked(existsSync).mockReturnValue(true)
  expect(isPdfReaderInstalled()).toBe(false)
  expect(() => requirePdfReader()).toThrow('未安装 PDF 阅读器')
  vi.mocked(existsSync).mockReturnValue(false)
  expect(isPdfReaderInstalled()).toBe(true)
  vi.mocked(existsSync).mockReturnValue(true)
  Object.defineProperty(app, 'isPackaged', { value: false, configurable: true })
  expect(isPdfReaderInstalled()).toBe(true)
  vi.unstubAllGlobals()
})
