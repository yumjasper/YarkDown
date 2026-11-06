import { BrowserWindow, app } from 'electron'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createWordDocument, WORD_CONTENT_WIDTH } from './wordDocument'
import { serializeWordDocument, type WordContent } from './wordDom'
import { captureOffscreenFrame } from './offscreenCapture'

const EXPORT_WIDTH = 1024

/**
 * Tall enough that a long document needs few slices, well below the 16384px
 * capture limit that each slice has to stay under.
 */
const PNG_VIEWPORT_HEIGHT = 4000
const DOCX_VIEWPORT_HEIGHT = 900

/** The scrollbar would otherwise be captured and widen the shot past `clientWidth`. */
const HIDE_SCROLLBAR_STYLE = '::-webkit-scrollbar{display:none!important}'

const prepareDocument = async(win: BrowserWindow): Promise<void> => {
  await win.webContents.executeJavaScript(`(async () => {
    const style = document.createElement('style')
    style.textContent = 'html,body{margin:0;background:#fff;color:#24292f}body{padding:32px;box-sizing:border-box}.markdown-body{width:100%;max-width:none;box-sizing:border-box}img{max-width:100%}' + ${JSON.stringify(
      HIDE_SCROLLBAR_STYLE
    )}
    document.head.append(style)
    await document.fonts.ready
    await Promise.all(Array.from(document.images).map(img => img.complete
      ? Promise.resolve()
      : new Promise(resolve => {
        img.addEventListener('load', resolve, { once: true })
        img.addEventListener('error', resolve, { once: true })
        setTimeout(resolve, 10000)
      })))
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  })()`)
}

interface DocumentMetrics {
  height: number
  width: number
  viewport: number
}

/** One file for a short document, several when a PNG had to be split. */
export interface DocumentExportResult {
  buffers: Buffer[]
  /** Page height in CSS px, so a split can be explained in the user's units. */
  pageHeight?: number
}

/**
 * A full-page PNG of a long document cannot be taken in one shot. Chromium caps
 * a captured surface at 16384px of height (2^14, the GPU texture limit): past it
 * the offscreen export window silently returns only the top 16384px, and a
 * visible window rejects the capture outright with an opaque `UnknownVizError`.
 * `Page.captureScreenshot` with `captureBeyondViewport` is no escape either — it
 * reports the full height but paints blank below the same limit.
 *
 * So the page is scrolled one viewport at a time, each view is captured, and the
 * slices are composited onto a canvas inside the page. Slices are only requested
 * at scroll positions Chromium has actually painted, which is what keeps each
 * capture below the limit.
 *
 * A document taller than one part becomes several images rather than a single
 * towering file: a 20000px strip is unreadable in a viewer and unusable when
 * pasted into a chat. Each image is composited on its own canvas, which keeps it
 * far below the 65535px canvas ceiling, and the caller reports the split to the
 * user. `PNG_MAX_PARTS` bounds the work so a runaway document is refused instead
 * of turning into dozens of files.
 */
const PNG_PART_MAX_HEIGHT = 8000
const PNG_MAX_PARTS = 20

/**
 * Picks where a part ends: the nearest block boundary at or before `target`, so
 * a paragraph or table row is not sliced in half mid-glyph. `tolerance` keeps a
 * cut from drifting far enough that parts become lopsided.
 */
const snapToBlockEdge = (target: number, start: number, edges: number[], tolerance: number): number => {
  let best = target
  for (const edge of edges) {
    if (edge <= start || edge > target) continue
    if (target - edge > tolerance) continue
    best = edge
  }
  return best
}

const captureFullPage = async(win: BrowserWindow): Promise<DocumentExportResult> => {
  const metrics: DocumentMetrics = await win.webContents.executeJavaScript(`(() => ({
    height: Math.ceil(document.documentElement.scrollHeight),
    width: Math.ceil(document.documentElement.clientWidth),
    viewport: document.documentElement.clientHeight
  }))()`)
  if (!metrics.height || !metrics.width || !metrics.viewport) {
    throw new Error('文档页面尺寸为空，无法导出图片。')
  }

  const partCount = Math.ceil(metrics.height / PNG_PART_MAX_HEIGHT)
  if (partCount > PNG_MAX_PARTS) {
    throw new Error(
      `文档高度 ${metrics.height}px，按每张约 ${PNG_PART_MAX_HEIGHT}px 拆分需要 ${partCount} 张图片，` +
        `超过 ${PNG_MAX_PARTS} 张上限，请改用 PDF 导出。`
    )
  }

  const boundaries = [0]
  if (partCount > 1) {
    const edges: number[] = await win.webContents.executeJavaScript(`(() => {
      const edges = []
      const root = document.querySelector('.markdown-body') || document.body
      for (const node of root.querySelectorAll('*')) {
        const style = getComputedStyle(node)
        if (style.display === 'inline' || style.position === 'fixed') continue
        const rect = node.getBoundingClientRect()
        if (rect.height <= 0) continue
        edges.push(Math.round(rect.bottom + window.scrollY))
      }
      return edges
    })()`)
    const sortedEdges = edges.sort((a, b) => a - b)
    for (let part = 1; part < partCount; part++) {
      const target = Math.round((metrics.height * part) / partCount)
      const start = boundaries[part - 1]!
      boundaries.push(snapToBlockEdge(target, start, sortedEdges, Math.min(1200, Math.round((target - start) * 0.4))))
    }
  }
  boundaries.push(metrics.height)

  // A spacer as tall as the viewport lets the last scroll request land exactly on
  // its offset instead of being clamped to `scrollHeight - clientHeight`; without
  // it the final slices would be drawn at a shifted position.
  await win.webContents.executeJavaScript(`(() => {
    const spacer = document.createElement('div')
    spacer.id = 'yarktext-png-spacer'
    spacer.style.cssText = 'height:${metrics.viewport}px'
    document.body.append(spacer)
  })()`)

  const buffers: Buffer[] = []
  const pageSetup = `(() => {
    const existing = document.getElementById('yarktext-png-canvas')
    if (existing) existing.remove()
  })()`
  try {
    for (let part = 0; part < boundaries.length - 1; part++) {
      const start = boundaries[part]!
      const end = boundaries[part + 1]!
      const partHeight = end - start
      await win.webContents.executeJavaScript(pageSetup)
      const setup: string = await win.webContents.executeJavaScript(`(() => {
        const canvas = document.createElement('canvas')
        canvas.id = 'yarktext-png-canvas'
        canvas.width = ${metrics.width}
        canvas.height = ${partHeight}
        canvas.style.cssText = 'position:fixed;left:-99999px;top:0'
        document.body.append(canvas)
        const context = canvas.getContext('2d')
        if (!context) return 'no-context'
        context.fillStyle = '#ffffff'
        context.fillRect(0, 0, canvas.width, canvas.height)
        return 'ok'
      })()`)
      if (setup !== 'ok') {
        throw new Error('无法创建用于拼接的绘图画布。')
      }

      for (let offset = start; offset < end; offset += metrics.viewport) {
        // The scroll offset Chromium settles on is the one the slice is drawn at,
        // so it goes back into the reply instead of being assumed equal to `offset`.
        const scrolled: number = await win.webContents.executeJavaScript(`(async () => {
          window.scrollTo(0, ${offset})
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
          return Math.round(window.scrollY)
        })()`)
        const image = await win.webContents.capturePage()
        if (image.isEmpty()) {
          throw new Error(
            `第 ${part + 1}/${boundaries.length - 1} 张图片的第 ${Math.floor((offset - start) / metrics.viewport) + 1} 段截图为空。`
          )
        }
        const dataUrl = image.toDataURL()
        const drawY = Math.max(0, scrolled - start)
        const sliceHeight = Math.min(metrics.viewport, end - scrolled)
        if (sliceHeight <= 0) continue
        // The capture carries device pixels (CSS px × devicePixelRatio) while the
        // canvas is sized in CSS px, so the slice is cropped by ratio and drawn at
        // an explicit size; the tail slice keeps only its visible top part.
        await win.webContents.executeJavaScript(`(async () => {
          const slice = new Image()
          slice.src = ${JSON.stringify(dataUrl)}
          await slice.decode()
          const sourceHeight = slice.height * ${sliceHeight} / ${metrics.viewport}
          document.getElementById('yarktext-png-canvas').getContext('2d')
            .drawImage(slice, 0, 0, slice.width, sourceHeight, 0, ${drawY}, ${metrics.width}, ${sliceHeight})
        })()`)
      }

      const dataUrl: string = await win.webContents.executeJavaScript(
        `document.getElementById('yarktext-png-canvas').toDataURL('image/png')`
      )
      const base64 = dataUrl.replace(/^data:image\/png;base64,/, '')
      // `toDataURL` answers `data:,` (an empty payload) when the canvas is too large
      // to read back, which would otherwise be written out as a zero-byte PNG.
      if (base64.length < 100) {
        throw new Error(`第 ${part + 1} 张图片无法读取，请改用 PDF 导出。`)
      }
      buffers.push(Buffer.from(base64, 'base64'))
    }
    return { buffers, pageHeight: metrics.height }
  } finally {
    await win.webContents
      .executeJavaScript(
        `document.getElementById('yarktext-png-canvas')?.remove();document.getElementById('yarktext-png-spacer')?.remove()`
      )
      .catch(() => {})
  }
}

const rasterizeMath = async(win: BrowserWindow): Promise<void> => {
  const count: number = await win.webContents.executeJavaScript(`(() => {
    const nodes = document.querySelectorAll('.katex-display, .katex:not(.katex-display .katex)')
    nodes.forEach((node, i) => node.setAttribute('data-export-math', String(i)))
    return nodes.length
  })()`)
  const mathWindow = new BrowserWindow({
    show: false,
    useContentSize: true,
    width: 1280,
    height: 512,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      offscreen: true
    }
  })
  try {
    const head: string = await win.webContents.executeJavaScript('document.head.innerHTML')
    const html =
      '<html><head>' +
      head +
      '<style>html,body{margin:0;padding:0;background:white}#formula{display:inline-block;padding:6px;font-size:29.334px}.katex{font-size:1em!important;white-space:nowrap!important}.katex-display{display:block!important;margin:0!important}.katex-display>.katex{display:block!important;text-align:center!important}</style></head><body><div id="formula"></div></body></html>'
    await mathWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
    await mathWindow.webContents.executeJavaScript('document.fonts.ready')
    for (let i = 0; i < count; i++) {
      const formula: { html: string; display: boolean } = await win.webContents
        .executeJavaScript(`(() => {
        const node = document.querySelector('[data-export-math="${i}"]')
        return { html: node.outerHTML, display: node.classList.contains('katex-display') }
      })()`)
      await mathWindow.webContents.executeJavaScript(`(() => {
        const container = document.querySelector('#formula')
        container.style.width = ${JSON.stringify(formula.display ? String((WORD_CONTENT_WIDTH - 6) * 2) + 'px' : '')}
        container.innerHTML = ${JSON.stringify(formula.html)}
      })()`)
      const rect: Electron.Rectangle = await mathWindow.webContents.executeJavaScript(`(async () => {
      const container = document.querySelector('#formula')
      container.getBoundingClientRect()
      await document.fonts.ready
      const rect = container.getBoundingClientRect()
      return { x: 0, y: 0, width: Math.ceil(rect.width), height: Math.ceil(rect.height) }
    })()`)
      if (!rect.width || !rect.height) continue
      await mathWindow.webContents.executeJavaScript(
        'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))'
      )
      const image = await captureOffscreenFrame(mathWindow, rect).catch((error) => {
        throw new Error(
          `公式 ${i + 1}/${count}（${rect.width}×${rect.height}）转换失败：${error instanceof Error ? error.message : String(error)}`
        )
      })
      await win.webContents.executeJavaScript(`(() => {
      const node = document.querySelector('[data-export-math="${i}"]')
      const img = document.createElement('img')
      img.src = ${JSON.stringify(image.toDataURL())}
      img.width = ${Math.ceil(rect.width / 2)}; img.height = ${Math.ceil(rect.height / 2)}
      img.setAttribute('data-word-math', '')
      img.alt = node.querySelector('annotation')?.textContent || '公式'
      if (node.classList.contains('katex-display')) {
        const paragraph = document.createElement('p')
        paragraph.style.textAlign = 'center'
        paragraph.setAttribute('data-word-equation', '')
        paragraph.append(img)
        node.replaceWith(paragraph)
      } else node.replaceWith(img)
    })()`)
    }
  } finally {
    mathWindow.destroy()
  }
}

const embedLocalImages = async(win: BrowserWindow): Promise<void> => {
  const images: string[] = await win.webContents.executeJavaScript(
    'Array.from(document.images, img => img.src)'
  )
  for (const src of new Set(images.filter((src) => /^(file:|https?:)/.test(src)))) {
    const filename = src.startsWith('file:') ? fileURLToPath(src) : new URL(src).pathname
    const extension = path.extname(filename).slice(1).toLowerCase()
    const mime =
      extension === 'svg'
        ? 'image/svg+xml'
        : extension === 'jpg'
          ? 'image/jpeg'
          : `image/${extension}`
    const bytes = src.startsWith('file:')
      ? await readFile(filename)
      : Buffer.from(await (await fetch(src, { signal: AbortSignal.timeout(20000) })).arrayBuffer())
    const data = `data:${mime};base64,${bytes.toString('base64')}`
    await win.webContents.executeJavaScript(
      `Array.from(document.images).filter(img => img.src === ${JSON.stringify(src)}).forEach(img => { img.src = ${JSON.stringify(data)} })`
    )
  }
}

/** Word keeps text and tables editable; formulas become images to preserve KaTeX layout. */
export const exportDocumentBinary = async(
  html: string,
  type: 'png' | 'docx'
): Promise<DocumentExportResult> => {
  const directory = await mkdtemp(path.join(app.getPath('temp'), 'yarktext-export-'))
  let win: BrowserWindow | undefined
  let stage = '创建导出窗口'
  try {
    const filename = path.join(directory, 'document.html')
    const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: file: https: http:; style-src 'unsafe-inline'; font-src data:; script-src 'none'">`
    await writeFile(filename, html.replace('<head>', `<head>${csp}`), 'utf8')
    win = new BrowserWindow({
      show: false,
      useContentSize: true,
      width: EXPORT_WIDTH,
      height: type === 'png' ? PNG_VIEWPORT_HEIGHT : DOCX_VIEWPORT_HEIGHT,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
        offscreen: true
      }
    })
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    stage = '载入文档'
    await win.loadFile(filename)
    stage = '准备文档资源'
    await prepareDocument(win)
    if (type === 'png') {
      stage = '截取页面'
      return await captureFullPage(win)
    }
    stage = '读取图片'
    await embedLocalImages(win)
    stage = '转换图片'
    await win.webContents.executeJavaScript(`(async () => {
      for (const img of Array.from(document.images)) {
        try { await img.decode() } catch { img.replaceWith(document.createTextNode(img.alt || '')); continue }
        const width = Math.min(img.naturalWidth, ${WORD_CONTENT_WIDTH})
        const height = img.naturalHeight * width / img.naturalWidth
        const canvas = document.createElement('canvas')
        canvas.width = Math.ceil(width * 2); canvas.height = Math.ceil(height * 2)
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
        img.src = canvas.toDataURL('image/png')
        img.width = Math.round(width); img.height = Math.round(height)
      }
    })()`)
    stage = '转换公式'
    await rasterizeMath(win)
    await win.webContents.executeJavaScript(
      `document.querySelectorAll('img:not([src]), img[src=""]').forEach(img => img.replaceWith(document.createTextNode(img.alt || ''))) `
    )
    const content: WordContent = await win.webContents.executeJavaScript(
      `(${serializeWordDocument.toString()})()`
    )
    stage = '生成 Word 文档'
    return { buffers: [await createWordDocument(content)] }
  } catch (error) {
    throw new Error(`${stage}失败：${error instanceof Error ? error.message : String(error)}`, {
      cause: error
    })
  } finally {
    win?.destroy()
    await rm(directory, { recursive: true, force: true })
  }
}
