import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { mkdirSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { launchWithDoc } from './helpers'

/**
 * Measures frame pacing for the interactions the wheel-scroll spec never covers:
 * window resizing, jumping through the table of contents, toggling the side bar,
 * switching to source mode, and jumping to the document ends. Those paths all
 * re-layout the whole document rather than merely scrolling it.
 */

interface FrameProbe {
  active: boolean
  last: number
  frames: number[]
  tasks: Array<{ start: number; duration: number }>
  observer: PerformanceObserver
  marks: Array<{ label: string; at: number }>
}

const beginFrames = async(page: Page) => {
  await page.evaluate(() => {
    const probe: FrameProbe = {
      active: true,
      last: performance.now(),
      frames: [],
      tasks: [],
      marks: [],
      observer: new PerformanceObserver((list) => {
        probe.tasks.push(
          ...list.getEntries().map((entry) => ({
            start: entry.startTime,
            duration: entry.duration
          }))
        )
      })
    }
    Object.assign(window, { __frameProbe: probe })
    probe.observer.observe({ entryTypes: ['longtask'] })
    const frame = (now: number) => {
      if (!probe.active) return
      probe.frames.push(now - probe.last)
      probe.last = now
      requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
  })
}

const mark = async(page: Page, label: string) => {
  await page.evaluate((value) => {
    const probe = (window as unknown as { __frameProbe: FrameProbe }).__frameProbe
    probe.marks.push({ label: value, at: performance.now() })
  }, label)
}

const collect = async(page: Page) => {
  return await page.evaluate(() => {
    const probe = (window as unknown as { __frameProbe: FrameProbe }).__frameProbe
    probe.active = false
    probe.observer.disconnect()
    const frames = probe.frames.slice().sort((a, b) => a - b)
    const worst = probe.frames
      .map((duration, index) => ({ index, duration: Math.round(duration) }))
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 8)
    return {
      frames: frames.length,
      p50: frames[Math.floor(frames.length * 0.5)],
      p95: frames[Math.floor(frames.length * 0.95)],
      p99: frames[Math.floor(frames.length * 0.99)],
      max: frames[frames.length - 1],
      over33: probe.frames.filter((frame) => frame > 33).length,
      over100: probe.frames.filter((frame) => frame > 100).length,
      worst,
      longTasks: probe.tasks.map((task) => Math.round(task.duration)).sort((a, b) => b - a),
      marks: probe.marks.map((entry) => ({ label: entry.label, at: Math.round(entry.at) }))
    }
  })
}

const report = (scenario: string, metrics: Awaited<ReturnType<typeof collect>>) => {
  console.log(
    `[scenario:${scenario}]`,
    JSON.stringify({
      frames: metrics.frames,
      p50: Math.round(metrics.p50 * 10) / 10,
      p95: Math.round(metrics.p95 * 10) / 10,
      p99: Math.round(metrics.p99 * 10) / 10,
      max: Math.round(metrics.max * 10) / 10,
      over33: metrics.over33,
      over100: metrics.over100,
      worst: metrics.worst.slice(0, 4),
      longTasks: metrics.longTasks.slice(0, 4)
    })
  )
  return metrics
}

test('measures frame pacing across layout-changing interactions', async() => {
  test.skip(
    process.env.LIGHTOPT_PERF !== '1' || process.env.LIGHTOPT_PERF_ACK_SYSTEM_STALL !== '1',
    'Opt-in real-document profiling'
  )
  test.setTimeout(300000)
  const file = 'D:/Tools/LightOpt/knowledge_base/lightopt-math-tutorial.md'
  const before = statSync(file)
  const mode = process.env.LIGHTOPT_PERF_MODE || 'interactions'
  const output = path.resolve('../../.tools/real-pdf-perf')
  mkdirSync(output, { recursive: true })
  const only = process.env.LIGHTOPT_PERF_ONLY || 'all'
  const { app, page } = await launchWithDoc(file, {
    suppressErrorDialog: true,
    env: { YARKTEXT_ACCESSIBILITY_MODE: process.env.LIGHTOPT_PERF_ACCESSIBILITY || 'default' },
    preferences: {
      tabBarVisibility: true,
      minimapEnabled: true,
      sideBarVisibility: true,
      titleBarStyle: 'custom'
    }
  })
  const results: Record<string, unknown> = {}
  try {
    await expect(page.locator('.editor-component .katex').first()).toBeVisible()
    const win = await app.browserWindow(page)
    const width = Number(process.env.LIGHTOPT_PERF_WINDOW_W || 1600)
    const height = Number(process.env.LIGHTOPT_PERF_WINDOW_H || 1000)
    await win.evaluate((electronWindow, size) => {
      electronWindow.unmaximize()
      electronWindow.setBounds({ width: size.width, height: size.height })
      electronWindow.focus()
    }, { width, height })
    await page.waitForTimeout(2500)

    if (only === 'all' || only === 'resize') {
      // Simulates a drag of the window corner: one setBounds per frame, which is
      // what the OS sends while the user holds the edge.
      await beginFrames(page)
      await mark(page, 'resize-start')
      for (let step = 0; step < 60; step++) {
        const delta = Math.round(Math.sin((step / 60) * Math.PI) * 260)
        await win.evaluate((electronWindow, size) => {
          electronWindow.setBounds({ width: size.width, height: size.height })
        }, { width: width - delta, height: height - Math.round(delta / 2) })
        await page.waitForTimeout(16)
      }
      await mark(page, 'resize-end')
      await win.evaluate((electronWindow, size) => {
        electronWindow.setBounds({ width: size.width, height: size.height })
      }, { width, height })
      await page.waitForTimeout(1200)
      results.resize = report('resize', await collect(page))
    }

    if (only === 'all' || only === 'toc') {
      // The side bar opens on the file tree; the outline only renders after the
      // rail's third icon (files, search, toc) is activated.
      await page.locator('.side-bar-rail .rail-icon').nth(2).click()
      await expect(page.locator('.side-bar-toc .el-tree-node__content').first()).toBeVisible()
      const entries = page.locator('.side-bar-toc .el-tree-node__content')
      const count = await entries.count()
      console.log('[toc] entries', count)
      if (count > 3) {
        await beginFrames(page)
        await mark(page, 'toc-start')
        for (const index of [10, 40, 90, 140, 200, 260, 320, 380]) {
          if (index >= count) continue
          await entries.nth(index).click({ timeout: 5000 })
          await page.waitForTimeout(220)
        }
        await mark(page, 'toc-end')
        await page.waitForTimeout(600)
        results.toc = report('toc', await collect(page))
      }
    }

    if (only === 'all' || only === 'sidebar') {
      await beginFrames(page)
      await mark(page, 'sidebar-start')
      for (let cycle = 0; cycle < 4; cycle++) {
        await page.evaluate(() => {
          const toggle = document.querySelector<HTMLElement>('.side-bar-toggler, .toggle-sidebar')
          toggle?.click()
        })
        await page.waitForTimeout(260)
      }
      await mark(page, 'sidebar-end')
      await page.waitForTimeout(600)
      results.sidebar = report('sidebar', await collect(page))
    }

    if (only === 'all' || only === 'ends') {
      await beginFrames(page)
      await mark(page, 'ends-start')
      for (let cycle = 0; cycle < 3; cycle++) {
        await page.evaluate(() => {
          const scroller = document.querySelector<HTMLElement>('.editor-component')
          if (scroller) scroller.scrollTop = scroller.scrollHeight
        })
        await page.waitForTimeout(280)
        await page.evaluate(() => {
          const scroller = document.querySelector<HTMLElement>('.editor-component')
          if (scroller) scroller.scrollTop = 0
        })
        await page.waitForTimeout(280)
      }
      await mark(page, 'ends-end')
      await page.waitForTimeout(600)
      results.ends = report('ends', await collect(page))
    }

    if (only === 'all' || only === 'source') {
      const toggle = async() => {
        await app.evaluate(({ Menu, BrowserWindow }) => {
          const menu = Menu.getApplicationMenu()
          const item = menu?.getMenuItemById('sourceCodeModeMenuItem')
          const win = BrowserWindow.getAllWindows()[0]
          item?.click(undefined, win, win.webContents)
        })
      }
      const timing = async(label: string, action: () => Promise<void>) => {
        const startedAt = await page.evaluate(() => performance.now())
        await action()
        // Two frames plus a settle, so the measurement includes the committed paint.
        await page.waitForTimeout(60)
        const endedAt = await page.evaluate(() => performance.now())
        return { label, ms: Math.round(endedAt - startedAt) }
      }
      await beginFrames(page)
      await mark(page, 'source-start')
      const phases: Array<{ label: string; ms: number }> = []
      for (let cycle = 0; cycle < 2; cycle++) {
        phases.push(await timing('enter', async() => {
          await toggle()
          await page.waitForSelector('.source-code .CodeMirror', { state: 'attached', timeout: 15000 })
        }))
        await page.waitForTimeout(600)
        phases.push(await timing('exit', async() => {
          await toggle()
          await page.waitForFunction(() => !document.querySelector('.source-code'), null, {
            timeout: 15000
          })
        }))
        await page.waitForTimeout(600)
      }
      console.log('[source phases]', JSON.stringify(phases))
      await mark(page, 'source-end')
      results.source = report('source', await collect(page))
    }

    writeFileSync(path.join(output, `${mode}.json`), JSON.stringify(results, null, 2))
    const after = statSync(file)
    expect({ size: after.size, mtimeMs: after.mtimeMs }).toEqual({
      size: before.size,
      mtimeMs: before.mtimeMs
    })
  } finally {
    await app
      .evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().forEach((window_) => window_.destroy())
      )
      .catch(() => {})
    await app.close()
  }
})
