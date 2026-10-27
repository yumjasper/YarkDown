import { expect, test } from '@playwright/test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type CodeMirror from 'codemirror'
import { expectNoRendererErrors, launchWithDoc } from './helpers'

test('continuous right-edge resizing coalesces TXT refreshes and preserves the document', async() => {
  test.setTimeout(90000)
  const directory = await mkdtemp(path.join(os.tmpdir(), 'yarktext-resize-'))
  const filename = path.join(directory, 'resize.txt')
  const text = Array.from({ length: 6000 }, (_, i) => `Line ${i}: resize regression with wrapped plain text content.`).join('\n')
  await writeFile(filename, text)
  const { app, page } = await launchWithDoc(filename, {
    suppressErrorDialog: true,
    preferences: { titleBarStyle: 'custom', txtWordWrap: true, minimapEnabled: true }
  })
  try {
    const editor = page.locator('.plain-text-editor .CodeMirror')
    await expect(editor).toBeVisible()
    await expect(page.locator('.minimap-tiles canvas[data-renderer="worker"]').first()).toBeAttached()
    await page.waitForTimeout(300)
    await editor.evaluate(element => {
      const cm = (element as HTMLElement & { CodeMirror: CodeMirror.Editor }).CodeMirror
      const original = cm.refresh.bind(cm)
      const probe = { refreshes: 0, baseline: null as ResizeObserver | null }
      Object.assign(window, { __resizeProbe: probe })
      cm.refresh = () => { probe.refreshes++; original() }
      // Reproduce the former per-notification refresh only in this disposable test window.
      probe.baseline = new ResizeObserver(() => cm.refresh())
      const container = element.parentElement
      if (!container) throw new Error('Missing TXT container')
      probe.baseline.observe(container)
    })
    const drag = () => app.evaluate(async({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0]
      for (let i = 0; i < 32; i++) {
        win.setBounds({ width: 1000 + i * 5, height: 720 })
        await new Promise(resolve => setTimeout(resolve, 20))
      }
    })
    await drag()
    await page.waitForTimeout(300)
    const baseline = await page.evaluate(() => {
      const probe = (window as unknown as { __resizeProbe: { refreshes: number; baseline: ResizeObserver } }).__resizeProbe
      probe.baseline.disconnect()
      const count = probe.refreshes
      probe.refreshes = 0
      return count
    })
    await drag()
    await page.waitForTimeout(300)
    const optimized = await page.evaluate(() =>
      (window as unknown as { __resizeProbe: { refreshes: number } }).__resizeProbe.refreshes)
    console.log('[resize refresh counts]', JSON.stringify({ baseline, optimized }))
    expect(baseline).toBeGreaterThan(10)
    expect(optimized).toBeLessThan(baseline / 2)
    await expect.poll(() => editor.evaluate(element => {
      const container = element.parentElement
      if (!container) throw new Error('Missing TXT container')
      return Math.abs(element.getBoundingClientRect().width - container.clientWidth)
    })).toBeLessThan(1)
    expect(await editor.evaluate(element =>
      (element as HTMLElement & { CodeMirror: CodeMirror.Editor }).CodeMirror.getValue())).toBe(text)
    await editor.evaluate(element => {
      const cm = (element as HTMLElement & { CodeMirror: CodeMirror.Editor }).CodeMirror
      cm.setCursor({ line: cm.lineCount() - 1, ch: 0 })
      cm.scrollIntoView(cm.getCursor())
    })
    await expect.poll(() => editor.evaluate(element => {
      const cm = (element as HTMLElement & { CodeMirror: CodeMirror.Editor }).CodeMirror
      return cm.getViewport().to
    })).toBe(6000)
    await expect.poll(() => page.locator('.plain-text-editor .CodeMirror-code > div').count()).toBeLessThan(500)
    await expect(page.locator('.minimap-tiles canvas[data-renderer="worker"]').first()).toBeAttached()
    await expectNoRendererErrors(app)
  } finally {
    await app.close()
    await rm(directory, { recursive: true, force: true })
  }
})
