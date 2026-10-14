import { BrowserWindow, app } from 'electron'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import HTMLtoDOCX from '@turbodocx/html-to-docx'

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
  for (let i = 0; i < count; i++) {
    const rect: Electron.Rectangle = await win.webContents.executeJavaScript(`(() => {
      const node = document.querySelector('[data-export-math="${i}"]')
      node.scrollIntoView({ block: 'center', inline: 'nearest' })
      const rect = node.getBoundingClientRect()
      return { x: Math.max(0, Math.floor(rect.x)), y: Math.max(0, Math.floor(rect.y)),
        width: Math.min(${EXPORT_WIDTH}, Math.ceil(rect.width)), height: Math.ceil(rect.height) }
    })()`)
    if (!rect.width || !rect.height) continue
    const image = await win.webContents.capturePage(rect)
    await win.webContents.executeJavaScript(`(() => {
      const node = document.querySelector('[data-export-math="${i}"]')
      const img = document.createElement('img')
      img.src = ${JSON.stringify(image.toDataURL())}
      img.width = ${rect.width}; img.height = ${rect.height}
      img.alt = node.querySelector('annotation')?.textContent || '公式'
      if (node.classList.contains('katex-display')) {
        const paragraph = document.createElement('p')
        paragraph.style.textAlign = 'center'
        paragraph.append(img)
        node.replaceWith(paragraph)
      } else node.replaceWith(img)
    })()`)
  }
}

const embedLocalImages = async(win: BrowserWindow): Promise<void> => {
  const images: string[] = await win.webContents.executeJavaScript(
    'Array.from(document.images, img => img.src)'
  )
  for (const src of new Set(images.filter((src) => src.startsWith('file:')))) {
    const filename = fileURLToPath(src)
    const extension = path.extname(filename).slice(1).toLowerCase()
    const mime =
      extension === 'svg'
        ? 'image/svg+xml'
        : extension === 'jpg'
          ? 'image/jpeg'
          : `image/${extension}`
    const data = `data:${mime};base64,${(await readFile(filename)).toString('base64')}`
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
    await rasterizeMath(win)
    await embedLocalImages(win)
    await win.webContents.executeJavaScript(`document.querySelectorAll('img:not([src]), img[src=""]').forEach(img => img.replaceWith(document.createTextNode(img.alt || ''))) `)
    const content: { html: string; title: string; direction: 'ltr' | 'rtl' } = await win.webContents
      .executeJavaScript(`({
      html: document.querySelector('article')?.outerHTML || document.body.innerHTML,
      title: document.title,
      direction: document.documentElement.dir === 'rtl' ? 'rtl' : 'ltr'
    })`)
    const output = await HTMLtoDOCX(content.html, null, {
      title: content.title,
      creator: 'YarkText',
      font: 'Microsoft YaHei',
      direction: content.direction,
      table: { row: { cantSplit: true } },
      imageProcessing: { svgHandling: 'native', suppressSharpWarning: true }
    })
    if (output instanceof Blob) return Buffer.from(await output.arrayBuffer())
    return Buffer.isBuffer(output) ? output : Buffer.from(new Uint8Array(output))
  } finally {
    win?.destroy()
    await rm(directory, { recursive: true, force: true })
  }
}
