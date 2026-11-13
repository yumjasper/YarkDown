import { expect, test } from '@playwright/test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { PDFDocument } from 'pdf-lib'
import { expectNoRendererErrors, launchWithDoc } from './helpers'
import { readingPassage as passage } from './fixtures/reading-passage'

test('official long passage translation preserves all sentences and synchronizes before completion', async() => {
  test.skip(process.env.YARKTEXT_READING_LIVE_TEST !== '1', 'Explicit public passage live test only.')
  test.setTimeout(180000)
  const directory = await mkdtemp(path.join(os.tmpdir(), 'yarktext-long-reading-'))
  const filename = path.join(directory, 'long-reading.pdf')
  const pdf = await PDFDocument.create()
  pdf.addPage().drawText('Long passage translation test', { x: 40, y: 700 })
  await writeFile(filename, await pdf.save())
  const { app, page } = await launchWithDoc(filename, { suppressErrorDialog: true })
  try {
    for (const provider of ['bing', 'google'] as const) {
      const id = `long-${provider}`
      let sequence = 0
      for (const [kind, source] of [['cold', passage], ['warm', passage + '\nThe result is consistent.']] as const) {
        const measurement = await page.evaluate(async({ provider, id, source, sequence }) => {
          const start = performance.now()
          let firstPreview: number | undefined, previews = 0
          const unsubscribe = window.electron.ipcRenderer.on('mt::reading::translation-update', (_event, update) => {
            if (update.id === id && update.sequence === sequence && update.provider === provider && update.text) {
              firstPreview ??= Math.round(performance.now() - start)
              previews++
            }
          })
          try {
            const result = await window.electron.ipcRenderer.invoke('mt::reading::translate', id, { provider, source, sequence })
            return { milliseconds: Math.round(performance.now() - start), firstPreview, previews, result }
          } finally { unsubscribe() }
        }, { provider, id, source, sequence: ++sequence })
        console.log(`LONG TRANSLATION ${provider}/${kind}: ${JSON.stringify(measurement)}`)
        expect(measurement.result.ok, JSON.stringify(measurement)).toBe(true)
        expect(measurement.firstPreview).toBeDefined()
        expect(measurement.firstPreview ?? Infinity).toBeLessThan(measurement.milliseconds)
        if (measurement.result.ok) {
          expect(measurement.result.data).toContain('扩散')
          expect(measurement.result.data).toMatch(/噪声|噪音|杂讯/)
          expect(measurement.result.data).toContain('纹理')
          expect(measurement.result.data).not.toMatch(/[擴紋視現資產對]/)
          expect(measurement.result.data.length).toBeGreaterThan(150)
          if (kind === 'warm') expect(measurement.result.data).toContain('一致')
        }
      }
      await page.evaluate(id => window.electron.ipcRenderer.invoke('mt::reading::close-web', id), id)
    }
    await expectNoRendererErrors(app)
  } finally {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(win => win.destroy()))
    await app.close()
    await rm(directory, { recursive: true, force: true })
  }
})
