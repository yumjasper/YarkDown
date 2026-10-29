/**
 * Generates the Windows installer artwork from the same logo masters as the
 * application icons, so a brand update never leaves stale install pages.
 *
 * NSIS only understands BMP for MUI header/sidebar images, and logos placed on
 * custom pages are loaded at run time with LoadImage, so every output here is a
 * plain 24-bit bottom-up BMP. Text is drawn as vector paths instead of glyphs:
 * libvips on Windows ships without fontconfig, so <text> would render as blank
 * boxes on a build machine and as real text on another.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const buildDir = path.join(root, 'packages/desktop/build')
const largeSource = await readFile(path.join(root, 'icon_YarkDown.png'))

/** Brand palette: the installer stays inside the logo's black/grey range. */
const INK = '#0F0F11'
const PAPER = '#FFFFFF'
const MUTED = '#8A8A90'

/**
 * The wizard body is painted by the shared #32770 window class in the system
 * dialog grey, and MUI cannot recolour it, so the header strip is matched to
 * that same face instead of being left white. Must stay in sync with
 * MUI_BGCOLOR in packages/desktop/build/windows/installer-ui.nsh, or the
 * header bitmap shows up as a white block against the page.
 */
const HEADER_BG = '#F0F0F0'

/**
 * Rebuilds the "Y" mark as a monochrome stencil. The logo master is a dark
 * glyph on white, which cannot sit on the dark sidebar as-is, so coverage is
 * taken from luminance: dark pixels stay opaque, the white plate is dropped.
 * `opacity` scales that coverage, which is how the faint watermark on the page
 * backdrop is produced - BMP has no alpha channel, so translucency has to be
 * baked in before the pixels reach NSIS.
 */
async function logoMark (size, color, opacity = 1) {
  const { data } = await sharp(largeSource)
    .resize(size, size, { fit: 'contain', background: PAPER })
    .flatten({ background: PAPER })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const rgb = Buffer.from(color.match(/[0-9a-f]{2}/gi).map(part => Number.parseInt(part, 16)))
  const rgba = Buffer.alloc(size * size * 4)
  for (let i = 0; i < size * size; i++) {
    // 255 at ink, 0 at paper, with the source luminance kept as the soft edge.
    rgba[i * 4] = rgb[0]
    rgba[i * 4 + 1] = rgb[1]
    rgba[i * 4 + 2] = rgb[2]
    rgba[i * 4 + 3] = Math.round(Math.max(0, Math.min(255, 255 - data[i])) * opacity)
  }

  return sharp(rgba, { raw: { width: size, height: size, channels: 4 } }).png().toBuffer()
}

/** Stroke-only letterforms: the wordmark is drawn, never typeset. */
const GLYPHS = {
  Y: [[[0.04, 0], [0.42, 0.46]], [[0.74, 0], [0.36, 0.46]], [[0.39, 0.4], [0.39, 1]]],
  A: [[[0.03, 1], [0.36, 0]], [[0.36, 0], [0.69, 1]], [[0.17, 0.6], [0.55, 0.6]]],
  R: [[[0.05, 1], [0.05, 0]], [[0.05, 0], [0.48, 0]], [[0.48, 0], [0.64, 0.13]], [[0.64, 0.13], [0.64, 0.34]], [[0.64, 0.34], [0.48, 0.47]], [[0.48, 0.47], [0.05, 0.47]], [[0.4, 0.47], [0.68, 1]]],
  K: [[[0.05, 0], [0.05, 1]], [[0.66, 0], [0.05, 0.55]], [[0.28, 0.36], [0.68, 1]]],
  T: [[[0, 0], [0.7, 0]], [[0.35, 0], [0.35, 1]]],
  E: [[[0.62, 0], [0.06, 0]], [[0.06, 0], [0.06, 1]], [[0.06, 1], [0.62, 1]], [[0.06, 0.5], [0.5, 0.5]]],
  X: [[[0, 0], [0.66, 1]], [[0.66, 0], [0, 1]]],
  M: [[[0.06, 1], [0.06, 0]], [[0.06, 0], [0.4, 0.56]], [[0.4, 0.56], [0.74, 0]], [[0.74, 0], [0.74, 1]]],
  D: [[[0.06, 0], [0.06, 1]], [[0.06, 0], [0.44, 0]], [[0.44, 0], [0.72, 0.3]], [[0.72, 0.3], [0.72, 0.7]], [[0.72, 0.7], [0.44, 1]], [[0.44, 1], [0.06, 1]]],
  O: [[[0.38, 0], [0.72, 0.3]], [[0.72, 0.3], [0.72, 0.7]], [[0.72, 0.7], [0.38, 1]], [[0.38, 1], [0.04, 0.7]], [[0.04, 0.7], [0.04, 0.3]], [[0.04, 0.3], [0.38, 0]]],
  W: [[[0.02, 0], [0.22, 1]], [[0.22, 1], [0.4, 0.34]], [[0.4, 0.34], [0.58, 1]], [[0.58, 1], [0.78, 0]]],
  N: [[[0.06, 1], [0.06, 0]], [[0.06, 0], [0.72, 1]], [[0.72, 1], [0.72, 0]]]
}

/** Lays the wordmark out as a stroke-only SVG of a fixed pixel height. */
function wordmarkSvg (text, { height, color, tracking, stroke }) {
  const cell = height * 0.72
  const gap = cell * tracking
  const width = Math.round(text.length * cell + (text.length - 1) * gap)
  const parts = []
  text.split('').forEach((letter, index) => {
    const glyph = GLYPHS[letter]
    if (!glyph) return
    const x = index * (cell + gap)
    for (const points of glyph) {
      const d = points
        .map(([gx, gy], i) => `${i === 0 ? 'M' : 'L'}${(x + gx * cell).toFixed(2)},${(gy * height).toFixed(2)}`)
        .join(' ')
      parts.push(`<path d="${d}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="square"/>`)
    }
  })
  return { width, svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${parts.join('')}</svg>` }
}

/**
 * Encodes 24-bit bottom-up BMP, the only raster NSIS loads everywhere without
 * GDI+ present. Rows are padded to a 4-byte boundary as the format requires.
 */
async function writeBmp (file, pngBuffer, { width, height }) {
  const { data } = await sharp(pngBuffer).flatten({ background: PAPER }).ensureAlpha(1).raw().toBuffer({ resolveWithObject: true })

  const rowSize = Math.ceil((width * 3) / 4) * 4
  const pixelBytes = rowSize * height
  const header = Buffer.alloc(54)
  header.write('BM', 0, 'ascii')
  header.writeUInt32LE(54 + pixelBytes, 2)
  header.writeUInt32LE(54, 10)
  header.writeUInt32LE(40, 14)
  header.writeInt32LE(width, 18)
  header.writeInt32LE(height, 22)
  header.writeUInt16LE(1, 26)
  header.writeUInt16LE(24, 28)
  header.writeUInt32LE(pixelBytes, 34)
  header.writeInt32LE(2835, 38)
  header.writeInt32LE(2835, 42)

  const pixels = Buffer.alloc(pixelBytes)
  for (let y = 0; y < height; y++) {
    // BMP stores rows bottom-up; the source buffer is top-down.
    const sourceRow = (height - 1 - y) * width * 4
    const targetRow = y * rowSize
    for (let x = 0; x < width; x++) {
      pixels[targetRow + x * 3] = data[sourceRow + x * 4 + 2]
      pixels[targetRow + x * 3 + 1] = data[sourceRow + x * 4 + 1]
      pixels[targetRow + x * 3 + 2] = data[sourceRow + x * 4]
    }
  }

  await writeFile(file, Buffer.concat([header, pixels]))
}

/** Dark plate behind the mark, read as the same surface as the app's sidebar. */
function sidebarBackground (width, height) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
      '<defs><linearGradient id="g" x1="0" y1="0" x2="0.35" y2="1">' +
      '<stop offset="0" stop-color="#1B1B1F"/><stop offset="0.55" stop-color="#0E0E10"/><stop offset="1" stop-color="#202025"/>' +
      '</linearGradient>' +
      // A single off-centre glow lifts the plate out of flat black without
      // introducing a second hue; it is the only lighting in the artwork.
      '<radialGradient id="glow" cx="0.5" cy="0.33" r="0.62">' +
      '<stop offset="0" stop-color="#FFFFFF" stop-opacity="0.16"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>' +
      '</radialGradient></defs>' +
      `<rect width="${width}" height="${height}" fill="url(#g)"/>` +
      `<rect width="${width}" height="${height}" fill="url(#glow)"/>` +
      '</svg>'
  )
}

async function composeSidebar (width, height) {
  const markSize = Math.round(width * 0.4)
  const mark = await logoMark(markSize, PAPER)
  const word = wordmarkSvg('YARKTEXT', { height: 12, color: '#F5F5F7', tracking: 0.5, stroke: 1.6 })
  const wordmark = await sharp(Buffer.from(word.svg)).png().toBuffer()

  const ruleWidth = Math.round(width * 0.34)
  const rule = await sharp(
    Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${ruleWidth}" height="2"><rect width="${ruleWidth}" height="1" fill="#FFFFFF" fill-opacity="0.55"/></svg>`)
  ).png().toBuffer()

  const tag = wordmarkSvg('MARKDOWN', { height: 7, color: MUTED, tracking: 0.62, stroke: 1.1 })
  const tagPng = await sharp(Buffer.from(tag.svg)).png().toBuffer()

  const markTop = Math.round(height * 0.31)
  const wordTop = markTop + markSize + Math.round(height * 0.05)
  const ruleTop = wordTop + 24

  // Oversized, near-transparent repeat of the mark bleeding off the lower edge.
  // BMP carries no alpha channel and NSIS cannot composite at run time, so the
  // translucency is resolved here, against the plate, before encoding. The
  // buffer is clipped to the plate: sharp rejects a composite that would extend
  // past the canvas instead of cropping it.
  const ghostSize = Math.round(width * 1.12)
  const ghost = await logoMark(ghostSize, '#FFFFFF', 0.06)
  const ghostLeft = Math.round(width * 0.28)
  const ghostTop = Math.round(height * 0.63)
  const ghostWidth = Math.min(ghostSize, width - ghostLeft)
  const ghostHeight = Math.min(ghostSize, height - ghostTop)
  const ghostClipped = await sharp(ghost)
    .extract({ left: 0, top: 0, width: ghostWidth, height: ghostHeight })
    .png()
    .toBuffer()

  return sharp(sidebarBackground(width, height))
    .composite([
      { input: ghostClipped, left: ghostLeft, top: ghostTop },
      { input: mark, left: Math.round((width - markSize) / 2), top: markTop },
      { input: wordmark, left: Math.round((width - word.width) / 2), top: wordTop },
      { input: rule, left: Math.round((width - ruleWidth) / 2), top: ruleTop },
      { input: tagPng, left: Math.round((width - tag.width) / 2), top: ruleTop + 14 }
    ])
    .png()
    .toBuffer()
}

/**
 * Header strip: mark plus wordmark, centred on white. electron-builder defines
 * MUI_HEADERIMAGE_RIGHT, so this block sits at the top-right of every page; a
 * rule inside the bitmap would therefore stop mid-header and read as an
 * artifact, and the page's own header line already separates the strip.
 */
async function composeHeader (width, height) {
  const markSize = Math.round(height * 0.52)
  const mark = await logoMark(markSize, INK)
  const word = wordmarkSvg('YARKTEXT', { height: 11, color: INK, tracking: 0.42, stroke: 1.7 })
  const wordmark = await sharp(Buffer.from(word.svg)).png().toBuffer()

  const gap = 9
  const left = Math.round((width - (markSize + gap + word.width)) / 2)
  const top = Math.round((height - markSize) / 2)

  return sharp({ create: { width, height, channels: 4, background: HEADER_BG } })
    .composite([
      { input: mark, left, top },
      { input: wordmark, left: left + markSize + gap, top: top + Math.round((markSize - 11) / 2) }
    ])
    .png()
    .toBuffer()
}

/**
 * Watermark for the stock pages, which have no plate to carry the mark. Page
 * bodies are painted by the dialog class in HEADER_BG and cannot hold a
 * translucent layer, so the mark is resolved against that same face here and the
 * bitmap is dropped straight onto the page: at this coverage it reads as ink
 * soaked into the paper rather than as a separate image.
 */
async function composeWatermark (size) {
  const mark = await logoMark(Math.round(size * 0.86), INK, 0.05)

  return sharp({ create: { width: size, height: size, channels: 4, background: HEADER_BG } })
    .composite([{ input: mark, left: Math.round(size * 0.07), top: Math.round(size * 0.07) }])
    .png()
    .toBuffer()
}

// BMP cannot be previewed by most viewers, so --preview <dir> drops a PNG copy
// of every image next to the build output.
const previewIndex = process.argv.indexOf('--preview')
const previewDir = previewIndex === -1 ? null : path.resolve(process.argv[previewIndex + 1] ?? '.')
if (previewDir) await mkdir(previewDir, { recursive: true })

const outputs = []
function stage (file, png, size) {
  outputs.push({ file, png, size })
}

stage(path.join(buildDir, 'installerSidebar.bmp'), await composeSidebar(164, 314), { width: 164, height: 314 })
stage(path.join(buildDir, 'uninstallerSidebar.bmp'), await composeSidebar(164, 314), { width: 164, height: 314 })
stage(path.join(buildDir, 'installerHeader.bmp'), await composeHeader(150, 57), { width: 150, height: 57 })
stage(path.join(buildDir, 'installerWatermark.bmp'), await composeWatermark(150), { width: 150, height: 150 })

for (const { file, png, size } of outputs) {
  await writeBmp(file, png, size)
  if (previewDir) await writeFile(path.join(previewDir, `${path.parse(file).name}.png`), png)
}

console.log('已生成安装器位图：installerSidebar.bmp、uninstallerSidebar.bmp、installerHeader.bmp、installerWatermark.bmp。')
