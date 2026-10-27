import { expect, test } from '@playwright/test'
import { closeSync, mkdirSync, openSync, statSync, writeFileSync, writeSync } from 'node:fs'
import path from 'node:path'
import { expectNoRendererErrors, launchWithDoc } from './helpers'

interface FrameProbe {
  start: number
  last: number
  active: boolean
  frames: number[]
  tasks: number[]
  observer: PerformanceObserver
}

interface ResizeProbe {
  timer: ReturnType<typeof setInterval>
  steps: number
  max: number
  severe: number
  sizes: Array<{ width: number; height: number }>
}

test('profiles diagonal corner resizing of the real math tutorial', async() => {
  test.skip(
    process.env.LIGHTOPT_PERF !== '1' || process.env.LIGHTOPT_PERF_ACK_SYSTEM_STALL !== '1',
    'Opt-in real-document profiling of a possible system-wide stall'
  )
  test.setTimeout(180000)
  const file = 'D:/Tools/LightOpt/knowledge_base/lightopt-math-tutorial.md'
  const before = statSync(file)
  const mode = process.env.LIGHTOPT_PERF_MODE || 'corner-default'
  const duration = Math.min(60000, Number(process.env.LIGHTOPT_PERF_RESIZE_MS || 6000))
  const step = Math.max(16, Number(process.env.LIGHTOPT_PERF_RESIZE_STEP || 24))
  const output = path.resolve('../../.tools/real-pdf-perf')
  mkdirSync(output, { recursive: true })
  const { app, page } = await launchWithDoc(file, {
    suppressErrorDialog: true,
    env: { YARKTEXT_ACCESSIBILITY_MODE: process.env.LIGHTOPT_PERF_ACCESSIBILITY || 'default' },
    preferences: {
      tabBarVisibility: true,
      minimapEnabled: process.env.LIGHTOPT_PERF_MINIMAP !== '0',
      sideBarVisibility: true,
      titleBarStyle: 'custom'
    }
  })
  const traceEvents: Array<{
    ph?: string
    name?: string
    dur?: number
    args?: { src_func?: string }
  }> = []
  const slowEvents: Array<{ name: string; dur: number }> = []
  let traceFile: number | undefined
  try {
    await expect(page.locator('.editor-component .katex').first()).toBeVisible()
    await expect(page.locator('.tabs-container li')).toHaveCount(1)
    const win = await app.browserWindow(page)
    await win.evaluate((browserWindow) => {
      browserWindow.unmaximize()
      browserWindow.setBounds({ x: 80, y: 60, width: 1280, height: 900 })
    })
    await page.waitForTimeout(2500)
    if (process.env.LIGHTOPT_PERF_CONTAINMENT === '0') {
      await page.addStyleTag({
        content:
          '.editor-component .mu-math-preview.measured-math-preview { content-visibility: visible !important; }'
      })
      await page.waitForTimeout(1200)
    }
    if (process.env.LIGHTOPT_PERF_HIDE_MATHML === '1') {
      await page.addStyleTag({ content: '.katex-mathml { display: none !important; }' })
      await page.waitForTimeout(1200)
    }
    if (process.env.LIGHTOPT_PERF_CSS) {
      await page.addStyleTag({ content: process.env.LIGHTOPT_PERF_CSS })
      await page.waitForTimeout(1500)
    }
    if (process.env.LIGHTOPT_PERF_ARIA_HIDE === '1') {
      await page.evaluate(() => {
        const scroller = document.querySelector<HTMLElement>('.editor-component')
        const container = document.querySelector<HTMLElement>('.mu-container')
        if (!scroller || !container) throw new Error('Editor container missing')
        const observer = new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              const block = entry.target as HTMLElement
              if (entry.isIntersecting) block.removeAttribute('aria-hidden')
              else block.setAttribute('aria-hidden', 'true')
            }
          },
          { root: scroller, rootMargin: '400px 0px' }
        )
        for (const block of container.children) observer.observe(block)
        Object.assign(window, { __ariaObserver: observer })
      })
      await page.waitForTimeout(1500)
    }
    if (process.env.LIGHTOPT_PERF_SIMULATE_GESTURE === '1') {
      await win.evaluate((browserWindow) => {
        browserWindow.webContents.send('mt::window-resize-state', true)
      })
      await page.waitForTimeout(300)
      if (process.env.LIGHTOPT_PERF_ARIA_EXTRA) {
        const selector = process.env.LIGHTOPT_PERF_ARIA_EXTRA
        const count = await page.evaluate((target) => {
          const nodes = [...document.querySelectorAll<HTMLElement>(target)]
          for (const node of nodes) node.setAttribute('aria-hidden', 'true')
          return nodes.length
        }, selector)
        console.log('[gesture extra]', JSON.stringify({ selector, count }))
        await page.waitForTimeout(300)
      }
      const pruned = await page.evaluate(
        () => document.querySelectorAll('.mu-container > [aria-hidden="true"]').length
      )
      console.log('[gesture]', JSON.stringify({ pruned }))
      const census = await page.evaluate(() => {
        const count = (selector: string) =>
          [...document.querySelectorAll<HTMLElement>(selector)].reduce(
            (sum, node) => sum + 1 + node.getElementsByTagName('*').length,
            0
          )
        return {
          body: document.body.getElementsByTagName('*').length,
          sideBar: count('.side-bar'),
          tabs: count('.tabs-container'),
          editor: count('.editor-component'),
          visibleBlocks: document.querySelectorAll('.mu-container > *:not([aria-hidden])').length,
          visibleNodes: [...document.querySelectorAll<HTMLElement>('.mu-container > *')]
            .filter((node) => node.getAttribute('aria-hidden') !== 'true')
            .reduce((sum, node) => sum + node.getElementsByTagName('*').length, 0)
        }
      })
      console.log('[gesture census]', JSON.stringify(census))
    }
    if (process.env.LIGHTOPT_PERF_PREMEASURE === '1') {
      const census = await page.evaluate(() => {
        const release = document.createElement('style')
        release.textContent =
          '.editor-component .mu-math-preview.measured-math-preview { content-visibility: visible !important; contain-intrinsic-block-size: none !important; }'
        document.head.appendChild(release)
        const container = document.querySelector<HTMLElement>('.mu-container')
        if (!container) throw new Error('Editor container missing')
        const blocks = [...container.children] as HTMLElement[]
        const tops = blocks.map((block) => block.getBoundingClientRect().top)
        const containerBottom = container.getBoundingClientRect().bottom
        const heights = blocks.map((_, index) =>
          index + 1 < blocks.length ? tops[index + 1] - tops[index] : containerBottom - tops[index]
        )
        const before = document.querySelector<HTMLElement>('.editor-component')?.scrollHeight || 0
        const style = document.createElement('style')
        style.textContent = '.editor-component .mu-container > * { content-visibility: auto; }'
        document.head.appendChild(style)
        blocks.forEach((block, index) => {
          block.style.setProperty('contain-intrinsic-size', `auto ${Math.round(heights[index])}px`)
        })
        release.remove()
        const after = document.querySelector<HTMLElement>('.editor-component')?.scrollHeight || 0
        return {
          blocks: blocks.length,
          total: Math.round(heights.reduce((sum, value) => sum + value, 0)),
          before,
          after
        }
      })
      console.log('[premeasure]', JSON.stringify(census))
      await page.waitForTimeout(1500)
    }
    const nodeCensus = await page.evaluate(() => {
      const count = (selector: string) =>
        document.querySelectorAll<HTMLElement>(selector).length
      const inner = (selector: string) =>
        [...document.querySelectorAll<HTMLElement>(selector)].reduce(
          (sum, node) => sum + node.getElementsByTagName('*').length,
          0
        )
      return {
        total: document.getElementsByTagName('*').length,
        katex: count('.katex'),
        mathmlHosts: count('.katex-mathml'),
        mathmlNodes: inner('.katex-mathml'),
        htmlNodes: inner('.katex-html'),
        previews: count('.mu-math-preview')
      }
    })
    console.log('[node census]', JSON.stringify(nodeCensus))
    const accessibilityModes = await app.evaluate(({ app: electronApp }) =>
      electronApp.getAccessibilitySupportFeatures()
    )
    const geometry = await page.evaluate(() => ({
      innerWidth,
      innerHeight,
      scrollHeight: document.querySelector<HTMLElement>('.editor-component')?.scrollHeight || 0,
      surfaceWidth: document.querySelector<HTMLElement>('.editor-component')?.offsetWidth || 0
    }))
    const cdp = await page.context().newCDPSession(page)
    traceFile = openSync(path.join(output, `${mode}.trace.json`), 'w')
    writeSync(traceFile, '{"traceEvents":[')
    let traceFirst = true
    cdp.on('Tracing.dataCollected', ({ value }) => {
      if (value.length && traceFile !== undefined) {
        writeSync(traceFile, (traceFirst ? '' : ',') + JSON.stringify(value).slice(1, -1))
        traceFirst = false
      }
      for (const raw of value) {
        const event = raw as (typeof traceEvents)[number]
        if (event.ph === 'X' && event.args?.src_func === 'HandleAXEvents') traceEvents.push(event)
        else if (event.ph === 'X' && (event.dur || 0) > 50000 && event.name)
          slowEvents.push({ name: event.name, dur: Math.round((event.dur || 0) / 1000) })
      }
    })
    await cdp.send('Tracing.start', {
      categories: 'devtools.timeline,toplevel,blink.user_timing',
      options: 'record-until-full'
    })
    await page.evaluate(() => {
      const probe: FrameProbe = {
        start: performance.now(),
        last: performance.now(),
        active: true,
        frames: [],
        tasks: [],
        observer: new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) probe.tasks.push(entry.duration)
        })
      }
      Object.assign(window, { __cornerProbe: probe })
      probe.observer.observe({ entryTypes: ['longtask'] })
      const frame = (now: number) => {
        if (!probe.active) return
        probe.frames.push(now - probe.last)
        probe.last = now
        requestAnimationFrame(frame)
      }
      requestAnimationFrame(frame)
    })
    // Drive both dimensions from the main process so no CDP round trip paces the gesture.
    await win.evaluate(
      (browserWindow, config) => {
        const bounds = browserWindow.getBounds()
        let phase = 0
        let last = performance.now()
        const probe: ResizeProbe = {
          steps: 0,
          max: 0,
          severe: 0,
          sizes: [],
          timer: undefined as unknown as ReturnType<typeof setInterval>
        }
        // Alternate inward and outward travel so both shrink and grow are covered.
        const travel = 120
        probe.timer = setInterval(() => {
          const now = performance.now()
          const gap = now - last
          last = now
          probe.max = Math.max(probe.max, gap)
          if (gap > 250) probe.severe++
          phase += 1
          const offset = Math.round(Math.sin(phase / 6) * travel)
          const width = bounds.width + offset
          const height = bounds.height + Math.round(offset * 0.7)
          browserWindow.setBounds({ width, height })
          probe.sizes.push({ width, height })
          probe.steps++
        }, config.step)
        Object.assign(globalThis, { __cornerResizeProbe: probe })
      },
      { step }
    )
    const start = Date.now()
    let stopped = false
    const axBatches: Array<{ phase: string; count: number; max: number; total: number }> = []
    let axSeen = 0
    const collectAx = (phase: string) => {
      const fresh = traceEvents
        .slice(axSeen)
        .filter((event) => event.ph === 'X' && event.args?.src_func === 'HandleAXEvents')
        .map((event) => (event.dur || 0) / 1000)
      axSeen = traceEvents.length
      axBatches.push({
        phase,
        count: fresh.length,
        max: Math.max(0, ...fresh),
        total: fresh.reduce((sum, value) => sum + value, 0)
      })
    }
    while (Date.now() - start < duration && !stopped) {
      await page.waitForTimeout(1000)
      collectAx(`chunk-${axBatches.length + 1}`)
      const renderer = await page.evaluate(() => {
        const probe = (window as unknown as { __cornerProbe: FrameProbe }).__cornerProbe
        const sorted = probe.frames.slice().sort((a, b) => a - b)
        return {
          frames: sorted.length,
          p95: sorted[Math.floor(sorted.length * 0.95)] || 0,
          max: Math.max(0, ...sorted),
          longTasks: probe.tasks.length,
          severeFrames: probe.frames.filter((frame) => frame > 250).length,
          innerWidth,
          innerHeight
        }
      })
      const main = await app.evaluate(() => {
        const probe = (globalThis as unknown as { __cornerResizeProbe: ResizeProbe })
          .__cornerResizeProbe
        return { steps: probe.steps, mainMax: probe.max, mainSevere: probe.severe }
      })
      console.log('[corner batch]', JSON.stringify({ ...renderer, ...main }))
      stopped =
        renderer.max > 1500 || renderer.severeFrames >= 3 || main.mainMax > 1500 || main.mainSevere >= 3
    }
    await app.evaluate(() =>
      clearInterval(
        (globalThis as unknown as { __cornerResizeProbe: ResizeProbe }).__cornerResizeProbe.timer
      )
    )
    if (process.env.LIGHTOPT_PERF_SIMULATE_GESTURE === '1') {
      await win.evaluate((browserWindow) => {
        browserWindow.webContents.send('mt::window-resize-state', false)
      })
      await page.waitForTimeout(300)
      const restored = await page.evaluate(
        () => document.querySelectorAll('.mu-container > [aria-hidden="true"]').length
      )
      collectAx('restore')
      console.log('[gesture]', JSON.stringify({ restoredHiddenBlocks: restored }))
    }
    await page.waitForTimeout(1200)
    collectAx('settle')
    console.log('[ax batches]', JSON.stringify(axBatches))
    const metrics = await page.evaluate(() => {
      const probe = (window as unknown as { __cornerProbe: FrameProbe }).__cornerProbe
      probe.active = false
      probe.observer.disconnect()
      const frames = probe.frames.slice().sort((a, b) => a - b)
      const surface = document.querySelector<HTMLElement>('.editor-component')
      const viewport = document.querySelector<HTMLElement>('.markdown-viewport')
      return {
        frames: frames.length,
        p95: frames[Math.floor(frames.length * 0.95)] || 0,
        max: Math.max(0, ...frames),
        over100: frames.filter((frame) => frame > 100).length,
        over250: frames.filter((frame) => frame > 250).length,
        longTasks: probe.tasks.length,
        blockingMs: probe.tasks.reduce((sum, value) => sum + value, 0),
        widthError: surface && viewport ? Math.abs(surface.offsetWidth - viewport.clientWidth) : 0,
        heightError: surface && viewport ? Math.abs(surface.offsetHeight - viewport.clientHeight) : 0,
        surfaceStyle: surface?.getAttribute('style'),
        innerWidth,
        innerHeight
      }
    })
    const main = await app.evaluate(() => {
      const probe = (globalThis as unknown as { __cornerResizeProbe: ResizeProbe })
        .__cornerResizeProbe
      return { steps: probe.steps, mainMax: probe.max, mainSevere: probe.severe }
    })
    const complete = new Promise<void>((resolve) =>
      cdp.once('Tracing.tracingComplete', () => resolve())
    )
    await cdp.send('Tracing.end')
    await complete
    if (traceFile !== undefined) {
      writeSync(traceFile, ']}')
      closeSync(traceFile)
      traceFile = undefined
    }
    const ax = traceEvents
      .filter((event) => event.ph === 'X' && event.args?.src_func === 'HandleAXEvents')
      .map((event) => (event.dur || 0) / 1000)
    const result = {
      mode,
      accessibilityModes,
      geometry,
      nodeCensus,
      step,
      ...main,
      ...metrics,
      maxAXTask: Math.max(0, ...ax),
      totalAXTaskMs: ax.reduce((sum, ms) => sum + ms, 0),
      axTaskCount: ax.length,
      axBatches,
      slowEvents: slowEvents.sort((a, b) => b.dur - a.dur).slice(0, 25)
    }
    writeFileSync(path.join(output, `${mode}.json`), JSON.stringify(result, null, 2))
    console.log('[corner summary]', JSON.stringify(result))
    expect(main.steps, 'Programmatic resizes must actually run').toBeGreaterThan(10)
    await expectNoRendererErrors(app)
    const after = statSync(file)
    expect({ size: after.size, mtimeMs: after.mtimeMs }).toEqual({
      size: before.size,
      mtimeMs: before.mtimeMs
    })
  } finally {
    if (traceFile !== undefined) {
      writeSync(traceFile, ']}')
      closeSync(traceFile)
    }
    await app
      .evaluate(() => {
        const probe = (globalThis as unknown as { __cornerResizeProbe?: ResizeProbe })
          .__cornerResizeProbe
        if (probe) clearInterval(probe.timer)
      })
      .catch(() => {})
    await app
      .evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().forEach((browserWindow) => browserWindow.destroy())
      )
      .catch(() => {})
    await app.close()
  }
})
