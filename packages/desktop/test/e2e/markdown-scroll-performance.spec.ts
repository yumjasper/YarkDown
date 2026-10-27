import { expect, test } from '@playwright/test'
import { closeSync, mkdirSync, openSync, statSync, writeFileSync, writeSync } from 'node:fs'
import path from 'node:path'
import { expectNoRendererErrors, launchWithDoc } from './helpers'

interface ScrollProbe {
  start: number
  last: number
  active: boolean
  frames: number[]
  tasks: Array<{ start: number; duration: number }>
  observer: PerformanceObserver
}

interface MainProbe {
  timer: ReturnType<typeof setInterval>
  wheels: number
  max: number
  severe: number
}

test('profiles sustained wheel scrolling of the real math tutorial', async() => {
  test.skip(
    process.env.LIGHTOPT_PERF !== '1' || process.env.LIGHTOPT_PERF_ACK_SYSTEM_STALL !== '1',
    'Opt-in real-document profiling'
  )
  test.setTimeout(180000)
  const file = 'D:/Tools/LightOpt/knowledge_base/lightopt-math-tutorial.md'
  const before = statSync(file)
  const mode = process.env.LIGHTOPT_PERF_MODE || 'sustained-scroll-default'
  const duration = Math.min(90000, Number(process.env.LIGHTOPT_PERF_SCROLL_MS || 60000))
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
  const batches: Array<{ wheels: number; scrollTop: number; max: number }> = []
  const slowEvents: Array<{ name: string; dur: number; thread?: string }> = []
  if (process.env.LIGHTOPT_PERF_CONSOLE === '1') {
    page.on('console', (message) => {
      const text = message.text()
      if (text.includes('[pruner]')) console.log('[renderer]', text)
    })
  }
  let traceFile: number | undefined
  try {
    await expect(page.locator('.editor-component .katex').first()).toBeVisible()
    await expect(page.locator('.tabs-container li')).toHaveCount(1)
    await expect(page.locator('.pdf-reader')).toHaveCount(0)
    const fixedWindow = await app.browserWindow(page)
    await fixedWindow.evaluate((win, size) => {
      win.unmaximize()
      win.setBounds({ width: size.width, height: size.height })
    }, {
      width: Number(process.env.LIGHTOPT_PERF_WINDOW_W || 1200),
      height: Number(process.env.LIGHTOPT_PERF_WINDOW_H || 800)
    })
    await page.waitForTimeout(2000)
    if (process.env.LIGHTOPT_PERF_CONTAINMENT === '0') {
      await page.addStyleTag({
        content:
          '.editor-component .mu-math-preview.measured-math-preview { content-visibility: visible !important; }'
      })
      await page.waitForTimeout(1000)
    }
    if (process.env.LIGHTOPT_PERF_PRUNE === 'visual') {
      const count = await page.evaluate(() => {
        // KaTeX emits two parallel renderings: MathML for assistive tech and an
        // HTML box tree for pixels. Hiding only the box tree keeps semantics.
        const nodes = [...document.querySelectorAll<HTMLElement>('.katex-html')]
        for (const node of nodes) node.setAttribute('aria-hidden', 'true')
        return nodes.length
      })
      console.log('[visual-only]', JSON.stringify({ count }))
      await page.waitForTimeout(1500)
    }
    if (process.env.LIGHTOPT_PERF_PRUNE === 'decorative') {
      const count = await page.evaluate(() => {
        const previews = [...document.querySelectorAll<HTMLElement>('.mu-math-preview')]
        for (const node of previews) {
          node.setAttribute('aria-hidden', 'true')
          // Keep the accessible name on the editable TeX source that owns it.
          const parent = node.closest<HTMLElement>('.mu-math-block')
          parent?.setAttribute('aria-label', 'Math formula')
        }
        return previews.length
      })
      console.log('[decorative math]', JSON.stringify({ count }))
      await page.waitForTimeout(1500)
    }
    if (process.env.LIGHTOPT_PERF_PRUNE === 'sticky') {
      const pruned = await page.evaluate(() => {
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
        for (const block of Array.from(container.children)) observer.observe(block)
        Object.assign(window, { __stickyPruneObserver: observer })
        return container.children.length
      })
      console.log('[sticky prune]', JSON.stringify({ blocks: pruned }))
      await page.waitForTimeout(1500)
    }
    const accessibilityModes = await app.evaluate(({ app }) =>
      app.getAccessibilitySupportFeatures()
    )
    const prunedByApp = await page.evaluate(() => {
      const scroller = document.querySelector<HTMLElement>('.editor-component')
      const container = document.querySelector<HTMLElement>('.mu-container')
      const blocks = [...(container?.children ?? [])] as HTMLElement[]
      const scrollerRect = scroller?.getBoundingClientRect()
      const hidden = (block: HTMLElement) => block.getAttribute('aria-hidden') === 'true'
      const onScreen = blocks.filter((block) => {
        const rect = block.getBoundingClientRect()
        if (!scrollerRect) return false
        return !(rect.bottom < scrollerRect.top || rect.top > scrollerRect.bottom)
      })
      return {
        pruned: blocks.filter(hidden).length,
        total: blocks.length,
        intersecting: onScreen.length,
        // Must stay 0: hiding a block the user can see would drop real content
        // from the accessibility tree.
        prunedOnScreen: onScreen.filter(hidden).length,
        scrollerHeight: scroller?.clientHeight ?? 0,
        scrollerWidth: scroller?.clientWidth ?? 0,
        scrollHeight: scroller?.scrollHeight ?? 0
      }
    })
    console.log('[app pruning]', JSON.stringify({ prunedByApp }))
    // Guards the failure mode this investigation hit twice: the pruner ran, found
    // no blocks and left the entire document in the accessibility tree, which is
    // exactly the stall it exists to prevent.
    expect(prunedByApp.pruned, 'Offscreen blocks must leave the AX tree').toBeGreaterThan(0)
    expect(prunedByApp.prunedOnScreen, 'Visible blocks must stay in the AX tree').toBe(0)
    const cdp = await page.context().newCDPSession(page)
    traceFile = openSync(path.join(output, `${mode}.trace.json`), 'w')
    writeSync(traceFile, '{"traceEvents":[')
    let traceFirst = true
    cdp.on('Tracing.dataCollected', ({ value }) => {
      if (value.length && traceFile !== undefined) {
        const json = JSON.stringify(value)
        writeSync(traceFile, (traceFirst ? '' : ',') + json.slice(1, -1))
        traceFirst = false
      }
      for (const raw of value) {
        const event = raw as (typeof traceEvents)[number] & {
          tid?: number
          cat?: string
        }
        if (event.ph === 'X' && event.args?.src_func === 'HandleAXEvents') traceEvents.push(event)
        else if (event.ph === 'X' && (event.dur || 0) > 40000 && event.name)
          slowEvents.push({
            name: event.name,
            dur: Math.round((event.dur || 0) / 1000),
            thread: `${event.cat ?? ''}#${event.tid ?? 0}`
          })
      }
    })
    await cdp.send('Profiler.enable')
    await cdp.send('Profiler.start')
    await cdp.send('Tracing.start', {
      categories: 'devtools.timeline,toplevel,blink.user_timing',
      options: 'record-until-full'
    })
    await page.evaluate(() => {
      const probe: ScrollProbe = {
        start: performance.now(),
        last: performance.now(),
        active: true,
        frames: [],
        tasks: [],
        observer: new PerformanceObserver((list) => {
          probe.tasks.push(
            ...list
              .getEntries()
              .map((entry) => ({ start: entry.startTime - probe.start, duration: entry.duration }))
          )
        })
      }
      Object.assign(window, { __scrollProbe: probe })
      probe.observer.observe({ entryTypes: ['longtask'] })
      const frame = (now: number) => {
        if (!probe.active) return
        probe.frames.push(now - probe.last)
        probe.last = now
        requestAnimationFrame(frame)
      }
      requestAnimationFrame(frame)
      performance.mark('sustained-scroll-start')
    })
    const box = await page.locator('.editor-component').boundingBox()
    if (!box) throw new Error('Editor is hidden')
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    const target = await app.browserWindow(page)
    await target.evaluate(
      (win, point) => {
        let last = performance.now()
        const probe: MainProbe = {
          wheels: 0,
          max: 0,
          severe: 0,
          timer: undefined as unknown as ReturnType<typeof setInterval>
        }
        // Inject without a CDP round-trip per wheel; AX work must not pace the producer.
        probe.timer = setInterval(() => {
          const now = performance.now()
          const gap = now - last
          last = now
          probe.max = Math.max(probe.max, gap)
          if (gap > 250) probe.severe++
          const direction = Math.floor(probe.wheels / 800) % 2 === 0 ? -1 : 1
          win.webContents.sendInputEvent({
            type: 'mouseWheel',
            x: point.x,
            y: point.y,
            deltaX: 0,
            deltaY: direction * 60,
            canScroll: true
          })
          probe.wheels++
        }, 25)
        Object.assign(globalThis, { __mainScrollProbe: probe })
      },
      { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) }
    )
    const start = Date.now()
    let stopped = false
    while (Date.now() - start < duration && !stopped) {
      await page.waitForTimeout(1000)
      const batch = await page.evaluate(() => {
        const probe = (window as unknown as { __scrollProbe: ScrollProbe }).__scrollProbe
        const el = document.querySelector<HTMLElement>('.editor-component')
        if (!el) throw new Error('Editor was removed during profiling')
        return {
          elapsed: performance.now() - probe.start,
          scrollTop: el.scrollTop,
          scrollHeight: el.scrollHeight,
          height: el.clientHeight,
          max: Math.max(0, ...probe.frames),
          severeFrames: probe.frames.filter((frame) => frame > 250).length,
          longTasks: probe.tasks.slice(),
          nodes: document.getElementsByTagName('*').length
        }
      })
      const main = await app.evaluate(() => {
        const probe = (globalThis as unknown as { __mainScrollProbe: MainProbe }).__mainScrollProbe
        return { wheels: probe.wheels, mainMax: probe.max, mainSevere: probe.severe }
      })
      batches.push({ ...main, ...batch })
      console.log('[scroll batch]', JSON.stringify({ ...main, ...batch }))
      stopped =
        process.env.LIGHTOPT_PERF_STOP !== '0' &&
        (batch.max > 1500 ||
          batch.severeFrames >= 3 ||
          main.mainMax > 1500 ||
          main.mainSevere >= 3 ||
          batch.longTasks.some((task) => task.duration > 1000))
      writeFileSync(
        path.join(output, `${mode}.progress.json`),
        JSON.stringify({ accessibilityModes, stopped, batches }, null, 2)
      )
    }
    await app.evaluate(() =>
      clearInterval(
        (globalThis as unknown as { __mainScrollProbe: MainProbe }).__mainScrollProbe.timer
      )
    )
    await page.waitForTimeout(700)
    const metrics = await page.evaluate(() => {
      const probe = (window as unknown as { __scrollProbe: ScrollProbe }).__scrollProbe
      probe.active = false
      probe.observer.disconnect()
      performance.mark('sustained-scroll-end')
      const frames = probe.frames.slice().sort((a, b) => a - b)
      return {
        frames: frames.length,
        p95: frames[Math.floor(frames.length * 0.95)],
        max: Math.max(0, ...frames),
        tasks: probe.tasks
      }
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
    const { profile } = await cdp.send('Profiler.stop')
    writeFileSync(path.join(output, `${mode}.cpuprofile`), JSON.stringify(profile))
    const ax = traceEvents
      .filter((event) => event.ph === 'X' && event.args?.src_func === 'HandleAXEvents')
      .map((event) => (event.dur || 0) / 1000)
    const result = {
      mode,
      stopped,
      accessibilityModes,
      maxAXTask: Math.max(0, ...ax),
      totalAXTaskMs: ax.reduce((sum, ms) => sum + ms, 0),
      slowEvents: slowEvents.sort((a, b) => b.dur - a.dur).slice(0, 30),
      ...metrics,
      batches
    }
    writeFileSync(path.join(output, `${mode}.json`), JSON.stringify(result, null, 2))
    console.log('[scroll summary]', JSON.stringify({ ...result, batches: batches.length }))
    expect(
      Math.max(...batches.map((batch) => batch.scrollTop)),
      'Input must actually move the document'
    ).toBeGreaterThan(500)
    await expectNoRendererErrors(app)
    const after = statSync(file)
    expect({ size: after.size, mtimeMs: after.mtimeMs }).toEqual({
      size: before.size,
      mtimeMs: before.mtimeMs
    })
  } finally {
    if (traceFile !== undefined) {
      writeSync(traceFile, '] }')
      closeSync(traceFile)
    }
    await app
      .evaluate(() => {
        const probe = (globalThis as unknown as { __mainScrollProbe?: MainProbe }).__mainScrollProbe
        if (probe) clearInterval(probe.timer)
      })
      .catch(() => {})
    await app
      .evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().forEach((win) => win.destroy())
      )
      .catch(() => {})
    await app.close()
  }
})
