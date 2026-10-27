import { expect, test } from '@playwright/test'
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { expectNoRendererErrors, launchWithDoc } from './helpers'

interface ResizeProbe {
  frames: number[]
  tasks: number[]
  canvasChanges: number
  surfaceChanges: number
  active: boolean
  sizes: number[]
  start: number
  resize: () => void
  observer: PerformanceObserver
  mutations: MutationObserver
}

test('profiles real LightOpt PDFs with Markdown across window and sidebar resizing', async() => {
  test.skip(process.env.LIGHTOPT_PERF !== '1' || process.env.LIGHTOPT_PERF_ACK_SYSTEM_STALL !== '1', 'Requires explicit acknowledgement of a possible system-wide stall')
  test.setTimeout(120000)
  const operation = process.env.LIGHTOPT_PERF_OPERATION || 'edge'
  expect(['maximize', 'edge', 'sidebar']).toContain(operation)
  const files = [
    'D:/Tools/LightOpt/lightopt-paper.pdf',
    'D:/Tools/LightOpt/LightOpt-论文中文翻译.pdf',
    'D:/Tools/LightOpt/knowledge_base/lightopt-math-tutorial.md'
  ]
  for (const file of files) expect(existsSync(file)).toBe(true)
  const fileStats = files.map(file => ({ size: statSync(file).size, mtimeMs: statSync(file).mtimeMs }))
  const mode = process.env.LIGHTOPT_PERF_MODE || 'baseline'
  const { app, page } = await launchWithDoc(files[2], {
    env: { YARKTEXT_ACCESSIBILITY_MODE: process.env.LIGHTOPT_PERF_ACCESSIBILITY === 'performance' ? 'performance' : 'default' },
    suppressErrorDialog: true,
    preferences: { tabBarVisibility: true, minimapEnabled: true, titleBarStyle: 'custom', sideBarVisibility: true }
  })
  const output = path.resolve('../../.tools/real-pdf-perf')
  mkdirSync(output, { recursive: true })
  const results: unknown[] = []
  try {
    await expect(page.locator('.editor-component')).toBeVisible()
    for (const file of files.slice(0, 2)) {
      await page.evaluate(file => window.electron.ipcRenderer.send('mt::open-file', file, {}), file)
      await expect(page.locator('.tabs-container li.active')).toContainText(path.basename(file))
      await expect(page.locator('.pdf-reader canvas').first()).toBeVisible({ timeout: 45000 })
      await page.waitForTimeout(2500)
    }
    const accessibilityModes = await app.evaluate(({ app }) => app.getAccessibilitySupportFeatures())
    const targetWindow = operation === 'edge' ? await app.browserWindow(page) : undefined
    const traceEnabled = process.env.LIGHTOPT_PERF_TRACE === '1'
    const traceEvents: Array<{ ph?: string; dur?: number; args?: { src_func?: string } }> = []
    const profileEnabled = process.env.LIGHTOPT_PERF_CPU === '1'
    const cdp = profileEnabled || traceEnabled ? await page.context().newCDPSession(page) : undefined
    if (cdp && profileEnabled) await cdp.send('Profiler.enable')
    if (cdp && traceEnabled) cdp.on('Tracing.dataCollected', ({ value }) => traceEvents.push(...value))
    for (const file of [files[2]]) {
      await page.locator('.tabs-container li').filter({ hasText: path.basename(file) }).click()
      if (file.endsWith('.pdf')) await expect(page.locator('.pdf-reader canvas').first()).toBeVisible({ timeout: 45000 })
      else await expect(page.locator('.editor-component')).toBeVisible()
      const toc = page.locator('.side-bar-rail > button').nth(2)
      if (await toc.getAttribute('aria-pressed') !== 'true') await toc.click()
      await expect(page.locator('.side-bar .drag-bar')).toBeVisible()
      for (const selectedOperation of [operation]) {
        console.log('[benchmark starting]', path.basename(file), selectedOperation, await page.locator('.tabs-container li.active').innerText())
        await expect(page.locator('.tabs-container li.active')).toContainText(path.basename(file))
        console.log('[stage] settle')
        await page.waitForTimeout(1500)
        await expect(page.locator('.editor-component .katex').first()).toBeVisible()
        console.log('[stage] geometry')
        const beforeGeometry = await page.evaluate(() => ({ innerWidth, innerHeight, viewport: document.querySelector('.markdown-viewport')?.getBoundingClientRect().toJSON(), surface: document.querySelector('.editor-component')?.getAttribute('style') }))
        console.log('[stage] capture')
        if (cdp && profileEnabled) await cdp.send('Profiler.start')
        if (cdp && traceEnabled) await cdp.send('Tracing.start', { categories: 'devtools.timeline,blink,cc,gpu,toplevel,v8,disabled-by-default-devtools.timeline', options: 'record-until-full' })
        await page.evaluate(() => {
          const probe: ResizeProbe = {
            frames: [], tasks: [], canvasChanges: 0, surfaceChanges: 0, active: true, sizes: [], start: performance.now(),
            resize: () => probe.sizes.push(window.innerWidth),
            observer: new PerformanceObserver(list => probe.tasks.push(...list.getEntries().filter(entry => entry.startTime < probe.start + 3500).map(entry => entry.duration))),
            mutations: new MutationObserver(records => {
              for (const record of records) {
                if (record.target instanceof HTMLCanvasElement) probe.canvasChanges++
                if (record.target instanceof Element && record.target.matches('.pdf-scroll, .editor-component')) probe.surfaceChanges++
              }
            })
          }
          Object.assign(window, { __realResizeProbe: probe })
          window.addEventListener('resize', probe.resize)
          let last = performance.now()
          const frame = (now: number) => {
            if (!probe.active || now > probe.start + 3500) return
            probe.frames.push(now - last)
            last = now
            requestAnimationFrame(frame)
          }
          requestAnimationFrame(frame)
          probe.observer.observe({ entryTypes: ['longtask'] })
          probe.mutations.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['width', 'height', 'style'] })
        })
        console.log('[stage] operation')
        const start = Date.now()
        if (operation === 'maximize') {
          await page.evaluate(async() => {
            const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
            performance.mark('resize-maximize')
            window.electron.windowControl.maximize()
            await pause(700)
            performance.mark('resize-restore')
            window.electron.windowControl.unmaximize()
            await pause(700)
          })
        }
        if (operation === 'edge' && targetWindow) await targetWindow.evaluate(win => win.setBounds({ width: 1060, height: 780 }))
        if (operation === 'sidebar') {
          const drag = page.locator('.side-bar .drag-bar')
          await expect(drag).toBeVisible()
          const box = await drag.boundingBox()
          if (!box) throw new Error('Sidebar drag handle is hidden')
          await page.mouse.move(box.x + box.width / 2, box.y + 100)
          await page.mouse.down()
          try {
            for (let i = 0; i < 1; i++) {
              await page.mouse.move(box.x + box.width / 2 + 20, box.y + 100)
              await page.waitForTimeout(20)
            }
          } finally { await page.mouse.up() }
        }
        await page.waitForTimeout(1000)
        const operationMs = Date.now() - start
        console.log('[stage] collect')
        const metrics = await page.evaluate(() => {
          const probe = (window as unknown as { __realResizeProbe: ResizeProbe }).__realResizeProbe
          probe.active = false
          window.removeEventListener('resize', probe.resize)
          probe.observer.disconnect()
          probe.mutations.disconnect()
          const sorted = probe.frames.sort((a, b) => a - b)
          const surface = document.querySelector<HTMLElement>('.pdf-scroll, .editor-component')
          const viewport = document.querySelector<HTMLElement>('.pdf-viewport, .markdown-viewport')
          return {
            frames: sorted.length, p95: sorted[Math.floor(sorted.length * 0.95)], max: Math.max(0, ...sorted),
            longTasks: probe.tasks.length, blockingMs: probe.tasks.reduce((sum, value) => sum + value, 0),
            canvasChanges: probe.canvasChanges, surfaceChanges: probe.surfaceChanges, windowWidths: probe.sizes,
            widthError: surface && viewport ? Math.abs(surface.offsetWidth - viewport.clientWidth) : 0,
            mathNodes: document.querySelectorAll('.katex').length, deferredPreviews: document.querySelectorAll('.measured-math-preview').length, innerWidth, innerHeight,
            viewport: viewport?.getBoundingClientRect().toJSON(), surfaceStyle: surface?.getAttribute('style'),
            canvases: [...document.querySelectorAll('.pdf-reader canvas')].map(node => ({ width: (node as HTMLCanvasElement).width, height: (node as HTMLCanvasElement).height }))
          }
        })
        if (cdp && traceEnabled) {
          const complete = new Promise<void>(resolve => cdp.once('Tracing.tracingComplete', () => resolve()))
          await cdp.send('Tracing.end')
          await complete
          writeFileSync(path.join(output, `${mode}-${operation}.trace.json`), JSON.stringify({ traceEvents }))
        }
        if (cdp && profileEnabled) {
          const { profile } = await cdp.send('Profiler.stop')
          writeFileSync(path.join(output, `${mode}-${path.basename(file)}-${operation}.cpuprofile`), JSON.stringify(profile))
        }
        const axTasks = traceEvents.filter(event => event.ph === 'X' && event.args?.src_func === 'HandleAXEvents').map(event => (event.dur || 0) / 1000)
        const maxAXTask = Math.max(0, ...axTasks)
        const result = { accessibilityModes, maxAXTask, totalAXTaskMs: axTasks.reduce((sum, duration) => sum + duration, 0), mode, file: path.basename(file), operation, duration: Date.now() - start, operationMs, beforeGeometry, ...metrics }
        results.push(result)
        console.log('[real PDF resize]', JSON.stringify(result))
        writeFileSync(path.join(output, `${mode}.json`), JSON.stringify({ results }, null, 2))
        await expect(page.locator('.tabs-container li.active')).toContainText(path.basename(file))
        expect(metrics.max, 'Stop on a severe renderer stall; do not proceed to additional resizing').toBeLessThan(250)
        if (traceEnabled) expect(maxAXTask, 'Stop on a severe main-process accessibility stall').toBeLessThan(250)
        expect(metrics.widthError).toBeLessThanOrEqual(1)
        expect(metrics.surfaceStyle).toContain('--settled-viewport-height')
        expect(metrics.surfaceChanges).toBeGreaterThan(0)
        if (operation === 'edge') expect(metrics.innerWidth).toBeLessThan(beforeGeometry.innerWidth)
        if (operation === 'maximize') {
          expect(Math.max(...metrics.windowWidths)).toBeGreaterThan(beforeGeometry.innerWidth)
          expect(metrics.innerWidth).toBe(beforeGeometry.innerWidth)
        }
      }
    }
    await expectNoRendererErrors(app)
    expect(files.map(file => ({ size: statSync(file).size, mtimeMs: statSync(file).mtimeMs }))).toEqual(fileStats)
  } finally {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(win => win.destroy())).catch(() => {})
    await app.close()
  }
})
