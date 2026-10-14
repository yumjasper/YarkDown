import { BrowserWindow, app } from 'electron'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createWordDocument, WORD_CONTENT_WIDTH } from './wordDocument'
import { serializeWordDocument, type WordContent } from './wordDom'

const EXPORT_WIDTH = 1024
const MAX_IMAGE_HEIGHT = 30000

const prepareDocument = async(win: BrowserWindow): Promise<void> => {
  await win.webContents.executeJavaScript(`(async () => {
    const style = document.createElement('style')
    style.textContent = 'html,body{margin:0;background:#fff;color:#24292f}body{padding:32px;box-sizing:border-box}.markdown-body{width:100%;max-width:none;box-sizing:border-box}img{max-width:100%}'
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

const captureDocument = async(win: BrowserWindow): Promise<Buffer> => {
  const height: number = await win.webContents.executeJavaScript(
    'Math.ceil(document.documentElement.scrollHeight)'
  )
  if (height > MAX_IMAGE_HEIGHT) {
    throw new Error('文档过长，无法导出为单张 PNG 图片，请使用 PDF 导出。')
  }
  win.setContentSize(EXPORT_WIDTH, Math.max(100, height))
  await win.webContents.executeJavaScript(
    'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))'
  )
  return (await win.webContents.capturePage()).toPNG()
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
    width: 1200,
    height: 900,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      offscreen: true
    }
  })
  try {
    for (let i = 0; i < count; i++) {
      const html: string = await win.webContents.executeJavaScript(`(() => {
      const formula = document.querySelector('[data-export-math="${i}"]').outerHTML
      const display = document.querySelector('[data-export-math="${i}"]').classList.contains('katex-display')
      return '<html><head>' + document.head.innerHTML + '<style>html,body{margin:0;padding:0;background:white}#formula{display:inline-block;padding:6px;font-size:29.334px}.katex{font-size:1em!important;white-space:nowrap!important}.katex-display{display:block!important;margin:0!important}.katex-display>.katex{display:block!important;text-align:center!important}</style></head><body><div id="formula" style="' + (display ? 'width:${(WORD_CONTENT_WIDTH - 6) * 2}px' : '') + '">' + formula + '</div></body></html>'
    })()`)
      // An inline span can have a paragraph-sized bounding box after wrapping;
      // render its clone alone so screenshots can never include adjacent text.
      await mathWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
      await mathWindow.webContents.executeJavaScript('document.fonts.ready')
      const rect: Electron.Rectangle = await mathWindow.webContents.executeJavaScript(`(() => {
      const rect = document.querySelector('#formula').getBoundingClientRect()
      return { x: 0, y: 0, width: Math.ceil(rect.width), height: Math.ceil(rect.height) }
    })()`)
      if (!rect.width || !rect.height) continue
      mathWindow.setContentSize(Math.max(100, rect.width), Math.max(100, rect.height))
      await mathWindow.webContents.executeJavaScript(
        'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))'
      )
      const image = await mathWindow.webContents.capturePage({
        x: 0,
        y: 0,
        width: rect.width,
        height: rect.height
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
export const exportDocumentBinary = async(html: string, type: 'png' | 'docx'): Promise<Buffer> => {
  const directory = await mkdtemp(path.join(app.getPath('temp'), 'yarktext-export-'))
  let win: BrowserWindow | undefined
  try {
    const filename = path.join(directory, 'document.html')
    const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: file: https: http:; style-src 'unsafe-inline'; font-src data:; script-src 'none'">`
    await writeFile(filename, html.replace('<head>', `<head>${csp}`), 'utf8')
    win = new BrowserWindow({
      show: false,
      useContentSize: true,
      width: EXPORT_WIDTH,
      height: 900,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
        offscreen: true
      }
    })
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    await win.loadFile(filename)
    await prepareDocument(win)
    if (type === 'png') return await captureDocument(win)
    await embedLocalImages(win)
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
    await rasterizeMath(win)
    await win.webContents.executeJavaScript(
      `document.querySelectorAll('img:not([src]), img[src=""]').forEach(img => img.replaceWith(document.createTextNode(img.alt || ''))) `
    )
    const content: WordContent = await win.webContents.executeJavaScript(
      `(${serializeWordDocument.toString()})()`
    )
    return await createWordDocument(content)
  } finally {
    win?.destroy()
    await rm(directory, { recursive: true, force: true })
  }
}
