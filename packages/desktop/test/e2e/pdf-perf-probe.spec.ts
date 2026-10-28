/**
 * PDF 阅读器性能探针。
 *
 * 这条 spec 刻意不是断言型测试：它只测量并落盘数据，阈值判定交给读数据的人。
 * 原因是历史上多处“看起来合理”的优化（content-visibility、contain:paint、
 * will-change）实测后零收益，没有基线数字的优化不可信。
 *
 * 通过环境变量启用，避免污染常规 CI：
 *   YARK_PDF_PERF=<样本 pdf 绝对路径> pnpm -C packages/desktop exec playwright test test/e2e/pdf-perf-probe.spec.ts
 *   YARK_PDF_PERF_QUICK=1  只跑首屏与翻页，跳过缩放矩阵
 *
 * 结果写入 .tools/pdf-perf/<timestamp>.json。
 */
import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { closeApp, expectNoRendererErrors, launchWithDoc } from './helpers'

const samplePath = process.env.YARK_PDF_PERF ?? ''
const quick = process.env.YARK_PDF_PERF_QUICK === '1'
const resultDir = path.resolve(__dirname, '../../../../.tools/pdf-perf')

interface Sample {
  label: string
  ms: number
  /** 测试侧的墙钟耗时，用于区分“渲染耗时”和“含等待的总耗时” */
  wallMs?: number
}

interface PageProbe {
  pageCount: number
  canvasCount: number
  renderedPixels: number
  layoutHeight: number
}

/**
 * 在页面里记录一段窗口内的长任务与帧间隔，返回分位数而非原始数组，
 * 避免大样本撑爆序列化后的体积。
 */
const collectLongTasks = async(page: Page): Promise<void> => {
  await page.evaluate(() => {
    const w = window as unknown as {
      __perfProbe__?: { tasks: number[]; frames: number[]; stop: () => void }
    }
    if (w.__perfProbe__) w.__perfProbe__.stop()
    const tasks: number[] = []
    const frames: number[] = []
    const po = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) tasks.push(e.duration)
    })
    try {
      po.observe({ type: 'longtask', buffered: false })
    } catch {
      /* Chromium 之外的实现不支持 longtask，静默降级 */
    }
    let last = performance.now()
    let running = true
    const tick = (): void => {
      if (!running) return
      const now = performance.now()
      frames.push(now - last)
      last = now
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
    w.__perfProbe__ = {
      tasks,
      frames,
      stop: () => {
        running = false
        po.disconnect()
      }
    }
  })
}

const readLongTasks = async(
  page: Page
): Promise<{ taskCount: number; taskMax: number; taskTotal: number; frameP95: number; frameMax: number }> => {
  return await page.evaluate(() => {
    const w = window as unknown as {
      __perfProbe__?: { tasks: number[]; frames: number[]; stop: () => void }
    }
    const probe = w.__perfProbe__
    if (!probe) return { taskCount: 0, taskMax: 0, taskTotal: 0, frameP95: 0, frameMax: 0 }
    probe.stop()
    const round = (n: number) => Math.round(n * 100) / 100
    const sorted = [...probe.frames].sort((a, b) => a - b)
    const pick = (q: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] : 0)
    return {
      taskCount: probe.tasks.length,
      taskMax: round(probe.tasks.reduce((m, v) => Math.max(m, v), 0)),
      taskTotal: round(probe.tasks.reduce((s, v) => s + v, 0)),
      frameP95: round(pick(0.95)),
      frameMax: round(sorted.length ? sorted[sorted.length - 1] : 0)
    }
  })
}

/** 统计已绘制 canvas 的真实像素占用，以及页面的实际布局高度。 */
const probeDom = async(page: Page): Promise<PageProbe> => {
  return await page.evaluate(() => {
    const canvases = Array.from(document.querySelectorAll<HTMLCanvasElement>('.pdfViewer canvas'))
    let pixels = 0
    for (const c of canvases) pixels += c.width * c.height
    const pages = document.querySelectorAll('.pdfViewer .page')
    const scroll = document.querySelector('.pdf-scroll')
    return {
      pageCount: pages.length,
      canvasCount: canvases.length,
      renderedPixels: pixels,
      layoutHeight: scroll ? Math.round(scroll.scrollHeight) : 0
    }
  })
}

/**
 * 等待第一张 canvas 真正完成绘制。
 *
 * 不能用“canvas 是否已存在”来判断：窗口复用或标签复用时 DOM 里可能已有
 * 上一份文档留下的 canvas，轮询会立刻命中并得出几毫秒的假快。
 * 这里先把现存 canvas 打上 seen 标记排除掉，只等待以下任一信号：
 *   - pagerendered 事件（pdf.js 每次页面绘制完成后派发）
 *   - 一个此前不存在的、宽高已非零的 canvas 被插入
 */
const waitForFirstPaint = async(page: Page): Promise<number> => {
  return await page.evaluate(() => {
    return new Promise<number>((resolve) => {
      const start = performance.now()
      let settled = false
      const finish = () => {
        if (settled) return
        settled = true
        mo.disconnect()
        resolve(Math.round(performance.now() - start) * 10 / 10)
      }
      for (const c of Array.from(document.querySelectorAll<HTMLCanvasElement>('.pdfViewer canvas'))) {
        c.dataset.probeSeen = '1'
      }
      const fresh = () =>
        Array.from(document.querySelectorAll<HTMLCanvasElement>('.pdfViewer canvas')).some(
          (c) => !c.dataset.probeSeen && c.width > 0 && c.height > 0
        )
      const mo = new MutationObserver(() => {
        if (fresh()) finish()
      })
      mo.observe(document.body, { childList: true, subtree: true, attributes: true })
      document.addEventListener('pagerendered', finish, { once: true, capture: true })
      if (fresh()) finish()
      setTimeout(finish, 30000)
    })
  })
}

const scrollBy = async(page: Page, delta: number): Promise<void> => {
  await page.evaluate((d) => {
    const el = document.querySelector('.pdf-scroll')
    if (el) el.scrollTop += d
  }, delta)
}

/**
 * 触摸设置里的主题无关项并不影响 PDF，这里只保证两次运行环境一致：
 * 固定窗口尺寸，避免布局差异污染对比。
 */
test.describe('PDF 性能探针', () => {
  test.skip(!samplePath, '设置 YARK_PDF_PERF=<pdf 绝对路径> 后才运行')

  let app: ElectronApplication
  let page: Page
  const samples: Sample[] = []
  const report: Record<string, unknown> = {}

  test.beforeAll(async() => {
    if (!fs.existsSync(samplePath)) throw new Error(`样本不存在: ${samplePath}`)
    const launched = await launchWithDoc(samplePath, { suppressErrorDialog: true })
    app = launched.app
    page = launched.page
    await page.setViewportSize({ width: 1440, height: 900 })
  })

  test.afterAll(async() => {
    if (!app) return
    fs.mkdirSync(resultDir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const file = path.join(resultDir, `${stamp}.json`)
    fs.writeFileSync(
      file,
      JSON.stringify(
        {
          sample: samplePath,
          sampleBytes: fs.statSync(samplePath).size,
          quick,
          samples,
          report
        },
        null,
        2
      ),
      'utf-8'
    )
    console.log(`\n[pdf-perf] 结果已写入 ${file}`)
    console.log(`[pdf-perf] ${JSON.stringify(report, null, 2)}`)
    await closeApp(app)
  })

  test('首屏打开耗时', async() => {
    const paint = await waitForFirstPaint(page)
    // 进程内相对耗时和相对导航起点的绝对耗时都记录：
    // 前者排除跨进程时钟偏差，后者用于和外部指标对齐。
    const sinceNavigation = await page.evaluate(() => Math.round(performance.now() * 10) / 10)
    samples.push({ label: 'first-canvas-paint-rel', ms: paint })
    samples.push({ label: 'first-canvas-paint-since-nav', ms: sinceNavigation })

    await page.locator('.pdfViewer .page').first().waitFor({ timeout: 30000 })
    const dom = await probeDom(page)
    report.firstScreen = { paintMs: paint, sinceNavigationMs: sinceNavigation, ...dom }

    // 首屏 canvas 像素不应为零，否则说明实际没画出任何内容
    expect(dom.canvasCount).toBeGreaterThan(0)
    expect(dom.renderedPixels).toBeGreaterThan(0)
  })

  test('连续翻页帧率与长任务', async() => {
    await collectLongTasks(page)
    const flips: number[] = []
    for (let i = 0; i < 12; i++) {
      const t = Date.now()
      await page.keyboard.press('PageDown')
      await page.waitForTimeout(280)
      flips.push(Date.now() - t)
    }
    const metrics = await readLongTasks(page)
    const dom = await probeDom(page)
    report.paging = { ...metrics, avgFlipMs: Math.round(flips.reduce((s, v) => s + v, 0) / flips.length), ...dom }
    expect(dom.canvasCount).toBeGreaterThan(0)
  })

  test('滚动帧率与长任务', async() => {
    await collectLongTasks(page)
    for (let i = 0; i < 30; i++) {
      await scrollBy(page, 260)
      await page.waitForTimeout(60)
    }
    const metrics = await readLongTasks(page)
    const dom = await probeDom(page)
    report.scrolling = { ...metrics, ...dom }
    expect(dom.canvasCount).toBeGreaterThan(0)
  })

  test('缩放矩阵耗时', async() => {
    test.skip(quick, 'YARK_PDF_PERF_QUICK=1 时跳过')
    test.setTimeout(120000)
    const zoomIn = page.locator('[aria-label="放大"], [aria-label="Zoom in"]').first()
    const hasZoomIn = (await zoomIn.count()) > 0
    const steps: Sample[] = []

    for (let i = 0; i < 5; i++) {
      // pagerendered 可能因为缩放在同一比例下不重绘而永不触发，
      // 因此在测试侧做竞速：谁先到用谁，超时当作“无重绘”，不再无限挂起。
      const rendered = page
        .evaluate(() => {
          return new Promise<number>((resolve) => {
            const t = performance.now()
            document.addEventListener(
              'pagerendered',
              () => resolve(Math.round((performance.now() - t) * 10) / 10),
              { once: true, capture: true }
            )
          })
        })
        .catch(() => -1)
      const fallback = new Promise<number>((resolve) => setTimeout(() => resolve(-1), 8000))
      const t0 = Date.now()
      if (hasZoomIn) await zoomIn.click()
      else await page.keyboard.press('Control+Equal')
      const renderMs = await Promise.race([rendered, fallback])
      steps.push({ label: `zoom-in-${i}`, ms: renderMs, wallMs: Date.now() - t0 })
      await page.waitForTimeout(80)
    }

    samples.push(...steps.map((s) => ({ label: s.label, ms: s.ms })))
    const dom = await probeDom(page)
    const valid = steps.filter((s) => s.ms >= 0)
    report.zoom = {
      redrawCount: valid.length,
      avgRenderMs: valid.length ? Math.round(valid.reduce((a, v) => a + v.ms, 0) / valid.length) : -1,
      steps,
      ...dom
    }
    // 缩放后 canvas 必须仍然存在，否则说明缩放把渲染打崩了
    expect(dom.canvasCount).toBeGreaterThan(0)
  })

  test('无渲染进程异常', async() => {
    await expectNoRendererErrors(app)
  })
})
