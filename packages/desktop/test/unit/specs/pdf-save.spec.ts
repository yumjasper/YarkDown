import { describe, expect, it, vi } from 'vitest'
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { assertPdfWritable, writePdfWithRetry } from '../../../src/main/utils/pdfSave'
const locked = () => Object.assign(new Error('locked'), { code: 'EPERM' })
describe('PDF save retry', () => {
  it('distinguishes read-only destinations from locks without changing attributes', async() => {
    const directory = await mkdtemp(path.join(tmpdir(), 'pdf-readonly-test-'))
    const filename = path.join(directory, 'readonly.pdf')
    try {
      await writeFile(filename, 'test')
      await chmod(filename, 0o444)
      await expect(assertPdfWritable(filename)).rejects.toMatchObject({ code: 'EPDFREADONLY' })
      await chmod(filename, 0o666)
      await expect(assertPdfWritable(filename)).resolves.toBeUndefined()
      await expect(assertPdfWritable(path.join(directory, 'new.pdf'))).resolves.toBeUndefined()
    } finally {
      await chmod(filename, 0o666)
      await rm(directory, { recursive: true, force: true })
    }
  })
  it('recovers from temporary Windows locks and rechecks each attempt', async() => {
    const write = vi.fn().mockRejectedValueOnce(locked()).mockRejectedValueOnce(locked()).mockResolvedValue(undefined)
    const verify = vi.fn().mockResolvedValue(undefined)
    const wait = vi.fn().mockResolvedValue(undefined)
    await writePdfWithRetry(write, verify, true, wait)
    expect(write).toHaveBeenCalledTimes(3)
    expect(verify).toHaveBeenCalledTimes(3)
    expect(wait.mock.calls.map(call => call[0])).toEqual([150, 300])
  })
  it('does not overwrite externally changed documents during retries', async() => {
    const write = vi.fn().mockRejectedValue(locked())
    const verify = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValue(new Error('changed'))
    await expect(writePdfWithRetry(write, verify, true, async() => {})).rejects.toThrow('changed')
    expect(write).toHaveBeenCalledTimes(1)
  })
  it('bounds persistent lock retries and does not retry unrelated errors', async() => {
    const write = vi.fn().mockRejectedValue(locked())
    await expect(writePdfWithRetry(write, async() => {}, true, async() => {})).rejects.toThrow('locked')
    expect(write).toHaveBeenCalledTimes(5)
    const invalid = vi.fn().mockRejectedValue(Object.assign(new Error('full'), { code: 'ENOSPC' }))
    await expect(writePdfWithRetry(invalid, async() => {}, true)).rejects.toThrow('full')
    expect(invalid).toHaveBeenCalledTimes(1)
  })
})
