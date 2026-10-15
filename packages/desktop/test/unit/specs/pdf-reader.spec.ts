import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { isPdfFile } from '../../../src/shared/pdf'
import { hasReadableExtension, isReadableFile } from '../../../src/common/filesystem/paths'
import { loadMarkdownFile, normalizeMarkdownPath, writeMarkdownFile } from '../../../src/main/filesystem/markdown'
vi.mock('electron', () => ({ app: { isPackaged: false } }))

vi.mock('../../../src/main/config', () => ({
  LINE_ENDING_REG: /\r\n|\r|\n/g, LF_LINE_ENDING_REG: /(?<!\r)\n/, CRLF_LINE_ENDING_REG: /\r\n/
}))
vi.mock('../../../src/main/filesystem/encoding', () => ({
  guessEncoding: () => { throw new Error('PDF bytes must not pass through text decoding') }
}))

const directories: string[] = []
afterEach(async() => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

describe('PDF document routing and write protection', () => {
  it('recognizes PDFs separately from editable documents', () => {
    expect(isPdfFile('中文 file.PDF')).toBe(true)
    expect(isPdfFile('file.pdf.md')).toBe(false)
    for (const name of ['file.pdf', 'file.md', 'file.txt']) expect(hasReadableExtension(name)).toBe(true)
    expect(hasReadableExtension('file.exe')).toBe(false)
  })

  it('loads only PDF metadata and refuses to overwrite the binary with text', async() => {
    const directory = await mkdtemp(path.join(tmpdir(), 'yarktext-pdf-unit-'))
    directories.push(directory)
    const filename = path.join(directory, '中文 file.PDF')
    const bytes = Buffer.from('%PDF-1.7\n\xff\x00\x80binary\n%%EOF', 'latin1')
    await writeFile(filename, bytes)
    expect(isReadableFile(filename)).toBe(true)
    expect(normalizeMarkdownPath(filename)).toEqual({ isDir: false, path: filename })
    const metadata = await loadMarkdownFile(filename, 'lf')
    expect(metadata.markdown).toBe('')
    expect(metadata.filename).toBe('中文 file.PDF')
    await expect(async() => writeMarkdownFile(filename, 'overwrite', {
      encoding: { encoding: 'utf8', isBom: false }, lineEnding: 'lf', adjustLineEndingOnSave: false
    })).rejects.toThrow('read-only')
    expect(await readFile(filename)).toEqual(bytes)
  })
})
