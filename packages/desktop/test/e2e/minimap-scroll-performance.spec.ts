import { expect, test } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { expectNoRendererErrors, launchWithDoc } from './helpers'

/**
 * Diagnostic for the two reports that came together: the document minimap never
 * finishes loading on open, and scrolling is far slower with the minimap and the
 * outline panel on screen than without them.
 *
 * Run with LIGHTOPT_PERF=1. The switches below select the configuration so the
 * same scroll injection can be compared across them:
 *   LIGHTOPT_PERF_MINIMAP=0   hide the minimap
 *   LIGHTOPT_PERF_TOC=0       close the outline panel
 */
test('profiles scrolling with the minimap and the outline panel', async() => {
  test.skip(process.env.LIGHTOPT_PERF !== '1', 'Opt-in real-document profiling')
  test.setTimeout(180000)
  const file = 'D:/Tools/LightOpt/knowledge_base/lightopt-math-tutorial.md'
  const duration = Math.min(60000, Number(process.env.LIGHTOPT_PERF_SCROLL_MS || 20000))
  const minimap = process.env.LIGHTOPT_PERF_MINIMAP !== '0'
  const outline = process.env.LIGHTOPT_PERF_TOC !== '0'
  const mode = process.env.LIGHTOPT_PERF_MODE || `minimap-${minimap ? 'on' : 'off'}-toc-${outline ? 'on' : 'off'}`
  const output = path.resolve('../../.tools/real-pdf-perf')
  mkdirSync(output, { recursive: true })
  const { app, page } = await launchWithDoc(file, {
    suppressErrorDialog: true,
    preferences: {
      tabBarVisibility: true,
      minimapEnabled: minimap,
      sideBarVisibility: outline,
      titleBarStyle: 'custom'
    }
  })
  try {
    await expect(page.locator('.editor-component .katex').first()).toBeVisible()
    const win = await app.browserWindow(page)
    await win.evaluate((target, size) => {
      target.unmaximize()
      target.setBounds({ width: size.width, height: size.height })
      // An unfocused window has its animation frames throttled, which the profile then
      // reports as a ~38 ms p95 gap on every configuration and hides the real cost.
      // Focus is what the user's window has while scrolling, so the sample needs it too.
      target.focus()
    }, {
      width: Number(process.env.LIGHTOPT_PERF_WINDOW_W || 1600),
      height: Number(process.env.LIGHTOPT_PERF_WINDOW_H || 1000)
    })
    if (outline) {
      await page.evaluate(() => {
        const pinia = (
          document.querySelector('#app') as unknown as {
            __vue_app__: {
              config: { globalProperties: { $pinia: { _s: Map<string, { SET_LAYOUT(v: unknown): void }> } } }
            }
          }
        ).__vue_app__.config.globalProperties.$pinia
        pinia._s.get('layout')!.SET_LAYOUT({ showSideBar: true, rightColumn: 'toc' })
      })
      await expect(page.locator('.side-bar-toc .el-tree')).toBeVisible({ timeout: 15000 })
    }
    await page.waitForTimeout(3000)
    const state = await page.evaluate(() => {
      const host = document.querySelector<HTMLElement>('.editor-minimap')
      const tiles = host?.querySelectorAll('.minimap-tiles canvas') ?? []
      const overlay = host?.querySelector<HTMLCanvasElement>('.minimap-overlay')
      return {
        hostPresent: Boolean(host),
        hostWidth: host?.clientWidth ?? 0,
        hostHeight: host?.clientHeight ?? 0,
        tiles: tiles.length,
        renderers: [...tiles].map((tile) => (tile as HTMLCanvasElement).dataset.renderer || ''),
        tileSize: (tiles[0] as HTMLCanvasElement | undefined)?.width ?? 0,
        overlayWidth: overlay?.width ?? 0,
        sliderHeight: host?.querySelector<HTMLElement>('.minimap-slider')?.style.height || '',
        scrollerFound: Boolean(document.querySelector('.editor-component')),
        blocks: document.querySelector('.mu-container')?.children.length ?? 0,
        scrollerWidth: document.querySelector<HTMLElement>('.editor-component')?.clientWidth ?? 0,
        scrollHeight: document.querySelector<HTMLElement>('.editor-component')?.scrollHeight ?? 0
      }
    })
    console.log('[minimap state]', JSON.stringify({ mode, ...state }))
    // Without this the profile can silently measure a blank minimap, which is
    // exactly the state the loading bug produced. Only meaningful when the minimap
    // is on: the off configuration is the control group.
    if (minimap) {
      expect(state.tiles, 'The minimap must have rendered tiles before profiling').toBeGreaterThan(0)
      expect(state.renderers, 'Every tile should come from the worker renderer').not.toContain('')
    }
    const outlineNodes = await page.evaluate(() => ({
      treeNodes: document.querySelectorAll('.side-bar-toc .el-tree-node').length,
      labels: document.querySelectorAll('.side-bar-toc .el-tree-node__label').length,
      headingCount: (window as unknown as { __mtTocCount?: number }).__mtTocCount ?? -1
    }))
    console.log('[outline nodes]', JSON.stringify(outlineNodes))
    const axTasks: Array<{ dur: number; stack?: string }> = []
    const cdp = await page.context().newCDPSession(page)
    const tracing = process.env.LIGHTOPT_PERF_TRACE !== '0'
    // Aggregated by event name: the remaining long frames are inside the browser,
    // so the only way to name the culprit is the timeline, not the JS profile.
    const timeline = new Map<string, { count: number; total: number; max: number }>()
    if (tracing) {
      cdp.on('Tracing.dataCollected', ({ value }) => {
        for (const raw of value) {
          const event = raw as { ph?: string; dur?: number; name?: string; args?: { src_func?: string } }
          if (event.ph === 'X' && event.args?.src_func === 'HandleAXEvents')
            axTasks.push({ dur: Math.round((event.dur || 0) / 1000) })
          if (event.ph === 'X' && event.dur && event.name && event.dur > 500) {
            const entry = timeline.get(event.name) || { count: 0, total: 0, max: 0 }
            entry.count++
            entry.total += event.dur / 1000
            entry.max = Math.max(entry.max, event.dur / 1000)
            timeline.set(event.name, entry)
          }
        }
      })
      await cdp.send('Tracing.start', {
        categories: 'devtools.timeline,toplevel,blink.user_timing,disabled-by-default-devtools.timeline',
        options: 'record-until-full'
      })
    }
    await page.evaluate(() => {
      const probe = {
        start: performance.now(),
        last: performance.now(),
        active: true,
        frames: [] as Array<{ at: number; gap: number }>,
        tasks: [] as Array<{ start: number; duration: number; container: string }>,
        loaf: [] as Array<{ duration: number; blocking: number; styleLayout: number; render: number; scripts: Array<{ source: string; duration: number }> }>
      }
      const observer = new PerformanceObserver((list) => {
        probe.tasks.push(
          ...list.getEntries().map((entry) => ({
            start: Math.round(entry.startTime - probe.start),
            duration: Math.round(entry.duration),
            container: (entry as PerformanceEntry & { containerType?: string }).containerType || (entry as PerformanceEntry & { name?: string }).name || '?'
          }))
        )
      })
      observer.observe({ entryTypes: ['longtask'] })
      const loaf = new PerformanceObserver((list) => {
        for (const raw of list.getEntries()) {
          const entry = raw as PerformanceEntry & {
            blockingDuration?: number
            styleAndLayoutStart?: number
            renderStart?: number
            scripts?: Array<{ sourceURL?: string; sourceFunctionName?: string; duration?: number }>
          }
          probe.loaf.push({
            duration: Math.round(entry.duration),
            blocking: Math.round(entry.blockingDuration || 0),
            styleLayout: Math.round(entry.styleAndLayoutStart ? entry.startTime + entry.duration - entry.styleAndLayoutStart : 0),
            render: Math.round(entry.renderStart ? entry.startTime + entry.duration - entry.renderStart : 0),
            scripts: (entry.scripts || []).map(script => ({
              source: `${script.sourceFunctionName || '?'} @ ${(script.sourceURL || '').split('/').pop()}`,
              duration: Math.round(script.duration || 0)
            }))
          })
        }
      })
      try { loaf.observe({ entryTypes: ['long-animation-frame'] }) } catch { /* older Chromium */ }
      Object.assign(window, { __minimapProbe: probe, __minimapObserver: observer })
      const frame = (now: number) => {
        if (!probe.active) return
        probe.frames.push({ at: now - probe.start, gap: now - probe.last })
        probe.last = now
        requestAnimationFrame(frame)
      }
      requestAnimationFrame(frame)
    })
    const box = await page.locator('.editor-component').boundingBox()
    if (!box) throw new Error('Editor is hidden')
    const scrollBefore = await page.evaluate(() => document.querySelector<HTMLElement>('.editor-component')?.scrollTop ?? -1)
    const point = { x: Math.round(box.x + box.width / 3), y: Math.round(box.y + box.height / 2) }
    await page.mouse.move(point.x, point.y)
    await win.evaluate(async(target, origin) => {
      // The renderer probe is already running and its frame list includes the idle
      // wait before this point. Marking the start on the same clock lets the
      // statistics cover the scroll only, not the setup gap.
      await target.webContents.executeJavaScript(
        '(() => { const probe = window.__minimapProbe; if (probe) probe.scrollFrom = performance.now() - probe.start })()'
      )
      let last = performance.now()
      const probe = { wheels: 0, max: 0, severe: 0, timer: 0 as unknown as ReturnType<typeof setInterval> }
      probe.timer = setInterval(() => {
        const now = performance.now()
        const gap = now - last
        last = now
        probe.max = Math.max(probe.max, gap)
        if (gap > 250) probe.severe++
        const direction = Math.floor(probe.wheels / 800) % 2 === 0 ? -1 : 1
        target.webContents.sendInputEvent({
          type: 'mouseWheel',
          x: origin.x,
          y: origin.y,
          deltaX: 0,
          deltaY: direction * 60,
          canScroll: true
        })
        probe.wheels++
      }, 25)
      Object.assign(globalThis, { __minimapMain: probe })
    }, { x: point.x, y: point.y })
    const started = Date.now()
    const profiling = process.env.LIGHTOPT_PERF_PROF !== '0'
    if (profiling) {
      await cdp.send('Profiler.enable')
      await cdp.send('Profiler.start')
    }
    while (Date.now() - started < duration) await page.waitForTimeout(1000)
    const { profile } = (profiling ? await cdp.send('Profiler.stop') : { profile: { nodes: [], samples: [], timeDeltas: [] } }) as {
      profile: { nodes: Array<{ id: number; callFrame: { functionName: string; url: string; lineNumber: number }; hitCount?: number }>; samples?: number[]; timeDeltas?: number[] }
    }
    const main = await app.evaluate(() => {
      const probe = (globalThis as unknown as {
        __minimapMain: { wheels: number; max: number; severe: number; timer: ReturnType<typeof setInterval> }
      }).__minimapMain
      clearInterval(probe.timer)
      return { wheels: probe.wheels, mainMax: Math.round(probe.max), mainSevere: probe.severe }
    })
    const renderer = await page.evaluate(() => {
      const probe = (window as unknown as {
        __minimapProbe: {          frames: Array<{ at: number; gap: number }>
          tasks: Array<{ start: number; duration: number; container: string }>
          scrollFrom?: number
          loaf: Array<{ duration: number; blocking: number; styleLayout: number; render: number; scripts: Array<{ source: string; duration: number }> }>
          active: boolean
        }
      }).__minimapProbe
      probe.active = false
      const from = probe.scrollFrom ?? 0
      const scrolled = probe.frames.filter((item) => item.at >= from).map((item) => item.gap)
      const frames = scrolled.slice().sort((a, b) => a - b)
      const tasks = probe.tasks
        .filter((task) => task.start >= from)
        .slice()
        .sort((a, b) => b.duration - a.duration)
      const loaf = probe.loaf.slice().sort((a, b) => b.duration - a.duration)
      return {
        frames: frames.length,
        totalFrames: probe.frames.length,
        windowMs: Math.round((probe.frames.at(-1)?.at ?? 0) - from),
        p95: Math.round(frames[Math.floor(frames.length * 0.95)] || 0),
        maxFrame: Math.round(frames.at(-1) || 0),
        severeFrames: frames.filter((value) => value > 250).length,
        longTasks: probe.tasks.length,
        scrollTasks: tasks.length,
        maxTask: tasks[0]?.duration ?? 0,
        topTasks: tasks.slice(0, 8),
        slowFrames: probe.frames
          .filter((item) => item.at >= from)
          .sort((a, b) => b.gap - a.gap)
          .slice(0, 5)
          .map((item) => ({ at: Math.round(item.at), gap: Math.round(item.gap) })),
        topLoaf: loaf.slice(0, 5)
      }
    })
    const cadence = await page.evaluate(() => {      const probe = (window as unknown as {
      __minimapProbe: { start: number; frames: Array<{ at: number }>; scrollFrom?: number }
    }).__minimapProbe
    const from = probe.scrollFrom ?? 0
    const perSecond: number[] = []
    for (let second = 0; second < 14; second++) {
      const start = from + second * 1000
      perSecond.push(probe.frames.filter((frame) => frame.at >= start && frame.at < start + 1000).length)
    }
    return {
      visibility: document.visibilityState,
      hasFocus: document.hasFocus(),
      devicePixelRatio: window.devicePixelRatio,
      scrollTop: document.querySelector<HTMLElement>('.editor-component')?.scrollTop ?? -1,
      perSecond
    }
    })
    console.log('[frame cadence]', JSON.stringify({ scrollBefore, ...cadence }))
    const byId = new Map(profile.nodes.map((node) => [node.id, node]))
    const selfTime = new Map<string, number>()
    const total = profile.timeDeltas?.reduce((sum, delta) => sum + delta, 0) ?? 1
    let index = 0
    for (const sampleId of profile.samples ?? []) {
      const delta = profile.timeDeltas?.[index++] ?? 0
      const frame = byId.get(sampleId)?.callFrame
      if (!frame) continue
      const key = `${frame.functionName || '(anonymous)'} @ ${frame.url.split('/').pop()}:${frame.lineNumber}`
      selfTime.set(key, (selfTime.get(key) ?? 0) + delta / 1000)
    }
    const hot = [...selfTime.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([name, ms]) => ({ name, ms: Math.round(ms), pct: Math.round((ms / (total / 1000)) * 100) }))
    console.log('[cpu hot]', JSON.stringify(hot))
    // Timeline data only arrives after `Tracing.end`, so the aggregation has to
    // happen after it; computing the summary first silently reported empty arrays.
    if (tracing) {
      const traceDone = new Promise<void>((resolve) => cdp.once('Tracing.tracingComplete', () => resolve()))
      await cdp.send('Tracing.end')
      await traceDone
      await page.waitForTimeout(300)
    }
    const topTimeline = [...timeline.entries()]
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 18)
      .map(([name, entry]) => ({ name, count: entry.count, total: Math.round(entry.total), max: Math.round(entry.max) }))
    console.log('[timeline]', JSON.stringify(topTimeline))
    const axSummary = {
      count: axTasks.length,
      max: Math.max(0, ...axTasks.map((task) => task.dur)),
      total: axTasks.reduce((sum, task) => sum + task.dur, 0)
    }
    console.log('[ax tasks]', JSON.stringify(axSummary))
    const result = { mode, state, outlineNodes, main, renderer, hot, timeline: topTimeline, ax: axSummary }
    writeFileSync(path.join(output, `${mode}.json`), JSON.stringify(result, null, 2))
    console.log('[minimap summary]', JSON.stringify(result))
    await expectNoRendererErrors(app)
  } finally {
    await app
      .evaluate(() => {
        const probe = (globalThis as unknown as { __minimapMain?: { timer: ReturnType<typeof setInterval> } })
          .__minimapMain
        if (probe) clearInterval(probe.timer)
      })
      .catch(() => {})
    await app
      .evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach((window) => window.destroy()))
      .catch(() => {})
    await app.close()
  }
})
