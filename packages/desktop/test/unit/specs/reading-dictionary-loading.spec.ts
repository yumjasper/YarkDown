import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import type * as FsPromises from 'node:fs/promises'
import { gzipSync } from 'node:zlib'

vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => process.cwd() } }))
vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof FsPromises>()
  const mockedRead = vi.fn()
  return { ...actual, readFile: mockedRead, default: { ...actual, readFile: mockedRead } }
})
const bundled = readFileSync('static/reading-dictionary/reading-bundle.json.gz')
beforeEach(() => { vi.resetModules(); vi.mocked(readFile).mockReset() })

describe('integrated dictionary resource loading', () => {
  it('shares one cold load across concurrent selections and reads no legacy resources', async() => {
    vi.mocked(readFile).mockResolvedValue(bundled)
    const { readVocabulary } = await import('../../../src/main/utils/readingDictionary')
    const results = await Promise.all([readVocabulary('noise', 'computing'), readVocabulary('generative', 'computing'), readVocabulary('building improve', 'computing')])
    expect(results.every(result => result.ok)).toBe(true)
    expect(readFile).toHaveBeenCalledTimes(1)
    expect(String(vi.mocked(readFile).mock.calls[0][0])).toMatch(/reading-bundle\.json\.gz$/)
    expect(results[0]).toMatchObject({ ok: true, data: { tokens: [{ entry: { senses: expect.arrayContaining(['噪声']) } }] } })
    await readVocabulary('noise', 'computing')
    expect(readFile).toHaveBeenCalledTimes(1)
  })
  it('validates input before loading and retries after a failed read', async() => {
    vi.mocked(readFile).mockRejectedValueOnce(new Error('missing')).mockResolvedValue(bundled)
    const { readVocabulary } = await import('../../../src/main/utils/readingDictionary')
    expect(await readVocabulary(null)).toMatchObject({ ok: false })
    expect(await readVocabulary('noise', 'unknown')).toMatchObject({ ok: false })
    for (const domain of ['research', 'mathematics', 'physics'])
      expect(await readVocabulary('noise', domain)).toMatchObject({ ok: false })
    expect(readFile).not.toHaveBeenCalled()
    expect(await readVocabulary('noise')).toMatchObject({ ok: false })
    expect(await readVocabulary('noise')).toMatchObject({ ok: true })
    expect(readFile).toHaveBeenCalledTimes(2)
  })
  it('rejects stale bundle formats without poisoning later loads', async() => {
    vi.mocked(readFile).mockResolvedValueOnce(gzipSync(JSON.stringify({ format: 0 }))).mockResolvedValue(bundled)
    const { readVocabulary } = await import('../../../src/main/utils/readingDictionary')
    expect(await readVocabulary('noise')).toMatchObject({ ok: false })
    expect(await readVocabulary('noise')).toMatchObject({ ok: true })
  })
})
