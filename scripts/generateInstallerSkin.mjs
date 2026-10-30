/**
 * Builds the nsNiuniuSkin (Duilib) asset bundle used by the optional
 * nsNiuniuSkin installer path.
 *
 * The skin is deliberately image-light: buttons and panels are painted with
 * `bkcolor` + `borderround` from the XML, which keeps the look consistent at any
 * DPI and means switching a colour is a one-line edit rather than a re-export of
 * six PNG states. Only three rasters exist, and each one carries something the
 * XML cannot express:
 *   hero.png  - the layered plate and the watermark, both of which need baked
 *               alpha because the skin engine composites nothing at run time,
 *   track.png - the unfilled rail of the progress slider,
 *   fill.png  - the ink fill of the same slider.
 *
 * Outputs land in packages/desktop/build/nsniuniu/skin, and the same directory
 * is zipped into skin.zip next to it, because the plugin only loads a zip.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'
import sharp from 'sharp'

if (process.platform === 'win32') await import('./buildInstallerAcrylic.mjs')

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const skinDir = path.join(root, 'packages/desktop/build/nsniuniu/skin')
const imageDir = path.join(skinDir, 'images')
const largeSource = await readFile(path.join(root, 'icon_YarkDown.png'))

/** Same black/grey range as the app icons; nothing outside it is introduced. */
const INK = '#0F0F11'
const PAPER = '#FFFFFF'
const RAIL = '#E8E8EA'

/**
 * The hero bitmap is baked at the window width and its declared height, so these
 * two numbers have to match install.xml and the hero row in every page file. The
 * plate is not stretched by the skin engine: changing the window without changing
 * these leaves the brand mark off-centre in its band.
 */
const HERO_WIDTH = 440
const HERO_HEIGHT = 132

/**
 * Rebuilds the brand mark as a monochrome stencil. The master is dark ink on a
 * transparent plate, so coverage is taken from alpha first and from luminance as a
 * fallback for pixels that carry no alpha. `opacity` scales that coverage, which is
 * how the ghost is faded - the skin engine has no alpha blending, so every
 * translucency has to be resolved here.
 */
async function logoMark (size, color, opacity = 1) {
  const { data } = await sharp(largeSource)
    .resize(size, size, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const rgb = Buffer.from(color.match(/[0-9a-f]{2}/gi).map(part => Number.parseInt(part, 16)))
  const rgba = Buffer.alloc(size * size * 4)
  for (let i = 0; i < size * size; i++) {
    const alpha = data[i * 4 + 3]
    const luminance = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]
    // A transparent pixel contributes nothing; an opaque dark pixel contributes
    // fully. Multiplying keeps the anti-aliased rim soft.
    const coverage = Math.max(0, Math.min(255, Math.round((255 - luminance) * (alpha / 255))))
    rgba[i * 4] = rgb[0]
    rgba[i * 4 + 1] = rgb[1]
    rgba[i * 4 + 2] = rgb[2]
    rgba[i * 4 + 3] = Math.round(coverage * opacity)
  }

  return sharp(rgba, { raw: { width: size, height: size, channels: 4 } }).png().toBuffer()
}

/**
 * The plate behind every page.
 *
 * It is a light frosted surface rather than a dark plate, because the window itself
 * is composited by DWM with an acrylic backdrop: on Windows 11 the plate and the
 * backdrop have to be the same family or the difference shows as a hard seam where
 * the hero bitmap ends. A single off-centre glow lifts the upper half without
 * adding a hue, and an oversized ghost of the mark bleeds off the lower edge - both
 * are the translucency the flat #32770 dialog could never provide, resolved into
 * pixels here because the skin engine composites nothing at run time.
 *
 * The mark is the real 1024px master, not a reconstruction: it is stencilled from
 * the master's coverage so the two stacked strokes survive, which the earlier
 * hand-traced approximation lost.
 */
async function composeHero () {
  const ghostSize = Math.round(HERO_HEIGHT * 1.5)
  const ghost = await logoMark(ghostSize, INK, 0.04)
  const ghostLeft = Math.round(HERO_WIDTH * 0.58)
  const ghostTop = Math.round(HERO_HEIGHT * 0.12)
  const ghostWidth = Math.min(ghostSize, HERO_WIDTH - ghostLeft)
  const ghostHeight = Math.min(ghostSize, HERO_HEIGHT - ghostTop)
  const ghostClipped = await sharp(ghost)
    .extract({ left: 0, top: 0, width: ghostWidth, height: ghostHeight })
    .png()
    .toBuffer()

  const markSize = 56
  const mark = await logoMark(markSize, INK)

  const backdrop = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${HERO_WIDTH}" height="${HERO_HEIGHT}">` +
      '<defs><linearGradient id="g" x1="0" y1="0" x2="0.3" y2="1">' +
      '<stop offset="0" stop-color="#FBFBFC"/><stop offset="0.55" stop-color="#F1F1F4"/><stop offset="1" stop-color="#E7E7EB"/>' +
      '</linearGradient>' +
      '<radialGradient id="glow" cx="0.26" cy="0.3" r="0.75">' +
      '<stop offset="0" stop-color="#FFFFFF" stop-opacity="0.95"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>' +
      '</radialGradient></defs>' +
      `<rect width="${HERO_WIDTH}" height="${HERO_HEIGHT}" fill="url(#g)"/>` +
      `<rect width="${HERO_WIDTH}" height="${HERO_HEIGHT}" fill="url(#glow)"/>` +
      '</svg>'
  )

  const markLeft = 24
  // Centred in the band: dropping the old -10 nudge matters here, because at 132px
  // tall a 10px offset is 8% of the plate and the mark visibly rides high.
  const markTop = Math.round((HERO_HEIGHT - markSize) / 2)
  const textLeft = markLeft + markSize + 16

  // The wordmark is set in the same family the pages use, so the title and the
  // body copy share a skeleton. Sized by typographic units rather than pixel
  // nudging: 22px semibold for the name, 12px muted for the descriptor.
  //
  // The two baselines are derived from the band centre, not copied from the taller
  // draft: the pair spans about 42px, so centring that block on 66 puts the name's
  // baseline at 63 and the descriptor's 21px below it.
  const wordmarkCentre = HERO_HEIGHT / 2
  const nameBaseline = Math.round(wordmarkCentre - 3)
  const descriptorBaseline = nameBaseline + 21
  const wordmark = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${HERO_WIDTH - textLeft - 24}" height="${HERO_HEIGHT}">` +
      `<text x="0" y="${nameBaseline}" font-family="Segoe UI Variable Text, Segoe UI, Microsoft YaHei UI, sans-serif" ` +
      'font-size="24" font-weight="600" fill="#0F0F11" letter-spacing="0.2">YarkText</text>' +
      `<text x="1" y="${descriptorBaseline}" font-family="Segoe UI Variable Text, Segoe UI, Microsoft YaHei UI, sans-serif" ` +
      'font-size="12" font-weight="400" fill="#8A8A90" letter-spacing="0.4">专注写作的 Markdown 编辑器</text>' +
      '</svg>'
  )

  return sharp(backdrop)
    .composite([
      { input: ghostClipped, left: ghostLeft, top: ghostTop },
      { input: mark, left: markLeft, top: markTop },
      { input: wordmark, left: textLeft, top: 0 }
    ])
    .png()
    .toBuffer()
}

/**
 * Flat tile used for the slider rail and its fill. The width matches the content
 * column (HERO_WIDTH - 24 * 2) rather than a small tile: the skin engine draws the
 * fill at the bitmap's own width instead of stretching a tiny source, so a 4px tile
 * produced a rail with no visible progress at all.
 */
async function flatTile (color) {
  return sharp({ create: { width: HERO_WIDTH - 48, height: 4, channels: 4, background: color } }).png().toBuffer()
}

/**
 * The check box is the one control the XML cannot draw on its own: Duilib
 * composites no shapes, so the tick and the empty box have to arrive as images.
 * Both states are square and same-sized so the label never shifts sideways when
 * the state flips.
 */
async function checkbox (checked) {
  const size = 16
  const box = checked
    ? `<rect x="0.5" y="0.5" width="${size - 1}" height="${size - 1}" rx="3" fill="${INK}"/>` +
      `<path d="M4 8.2 L6.8 11 L12 5.2" fill="none" stroke="${PAPER}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`
    : `<rect x="0.5" y="0.5" width="${size - 1}" height="${size - 1}" rx="3" fill="${PAPER}" stroke="#C6C6CC" stroke-width="1"/>`

  return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">${box}</svg>`))
    .png()
    .toBuffer()
}

/**
 * The licence shown inside the skin overlay.
 *
 * The plugin reads this file with the process ANSI code page and passes the raw
 * bytes to a RichEdit without sniffing for UTF-8, so it is written as GBK here.
 * Kept in the generator rather than hand-edited so the encoding cannot drift
 * back to UTF-8, where the Chinese prose renders as mojibake.
 */
const LICENSE_TEXT = `YarkText 软件许可协议

MIT License

Copyright (c) 2017-present Luo Ran
Copyright (c) 2018-present MarkText Contributors

特此免费授予任何获得本软件及相关文档文件（以下称"本软件"）副本的人不受限制地处置本软件的权利，
包括不受限制地使用、复制、修改、合并、发布、分发、再授权和/或销售本软件副本的权利，
并允许获得本软件的人在符合下列条件的前提下这样做：

上述版权声明和本许可声明应包含在本软件的所有副本或主要部分中。

本软件按"原样"提供，不附带任何明示或暗示的担保，包括但不限于对适销性、特定用途适用性
以及不侵权的担保。在任何情况下，作者或版权持有人均不对因本软件或本软件的使用或其他
交易而产生的任何索赔、损害或其他责任承担责任，无论是合同行为、侵权行为还是其他行为。

---

YarkText 基于 MarkText 构建，并包含遵循各自许可证的第三方组件。
完整清单见安装目录下的 THIRD-PARTY-LICENSES.txt，或项目主页：
https://github.com/yumjasper/YarkDown
`

/** Node has no built-in GBK encoder, so the lookup goes through TextDecoder. */
function toGbk (input) {
  const decoder = new TextDecoder('gbk', { fatal: true })
  const byChar = new Map()
  for (let high = 0x81; high <= 0xfe; high++) {
    for (let low = 0x40; low <= 0xfe; low++) {
      if (low === 0x7f) continue
      const bytes = Buffer.from([high, low])
      let decoded
      try {
        decoded = decoder.decode(bytes)
      } catch {
        continue
      }
      if (decoded.length === 1 && !byChar.has(decoded)) byChar.set(decoded, bytes)
    }
  }

  const out = []
  for (const char of input) {
    const code = char.codePointAt(0)
    if (code < 0x80) {
      out.push(code)
      continue
    }
    const bytes = byChar.get(char)
    if (!bytes) throw new Error(`字符 ${char} (U+${code.toString(16)}) 无法用 GBK 表示`)
    out.push(bytes[0], bytes[1])
  }
  return Buffer.from(out)
}

await mkdir(imageDir, { recursive: true })

const hero = await composeHero()
const track = await flatTile(RAIL)
const fill = await flatTile(INK)
const checkOff = await checkbox(false)
const checkOn = await checkbox(true)

await writeFile(path.join(imageDir, 'hero.png'), hero)
await writeFile(path.join(imageDir, 'track.png'), track)
await writeFile(path.join(imageDir, 'fill.png'), fill)
await writeFile(path.join(imageDir, 'check_off.png'), checkOff)
await writeFile(path.join(imageDir, 'check_on.png'), checkOn)

// The plugin resolves the window and taskbar icon as logo.ico inside the extracted
// plugin directory and ignores every other name, so the mark is written here as a
// multi-size ICO rather than shipped as one fixed raster: Windows picks the entry
// that matches the DPI of the taskbar, and a single 32px image looks blurry there.
const icoSizes = [16, 20, 24, 32, 40, 48, 64, 128, 256]
const icoImages = new Map()
for (const size of icoSizes) {
  icoImages.set(size, await sharp(largeSource).resize(size, size).png().toBuffer())
}

const icoHeader = Buffer.alloc(6 + icoSizes.length * 16)
icoHeader.writeUInt16LE(1, 2)
icoHeader.writeUInt16LE(icoSizes.length, 4)
let icoOffset = icoHeader.length
icoSizes.forEach((size, index) => {
  const image = icoImages.get(size)
  const entry = 6 + index * 16
  // ICO stores 256 as zero, because the field is one byte wide.
  icoHeader[entry] = size === 256 ? 0 : size
  icoHeader[entry + 1] = size === 256 ? 0 : size
  icoHeader.writeUInt16LE(1, entry + 4)
  icoHeader.writeUInt16LE(32, entry + 6)
  icoHeader.writeUInt32LE(image.length, entry + 8)
  icoHeader.writeUInt32LE(icoOffset, entry + 12)
  icoOffset += image.length
})
const ico = Buffer.concat([icoHeader, ...icoSizes.map(size => icoImages.get(size))])
await writeFile(path.join(root, 'packages/desktop/build/nsniuniu/logo.ico'), ico)

// The plugin only ever loads a zip, and it expects the skin at the archive root
// rather than under a folder, so every entry is added with a relative name.
const zip = new JSZip()
const xmlFiles = ['install.xml', 'configpage.xml', 'installingpage.xml', 'finishpage.xml',
  'uninstallpage.xml', 'uninstallingpage.xml', 'uninstallfinishpage.xml', 'msgbox.xml']
for (const name of xmlFiles) {
  zip.file(name, await readFile(path.join(skinDir, name), 'utf8'), { binary: false })
}
zip.file('images/hero.png', hero)
zip.file('images/track.png', track)
zip.file('images/fill.png', fill)
zip.file('images/check_off.png', checkOff)
zip.file('images/check_on.png', checkOn)

const archive = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } })
await writeFile(path.join(root, 'packages/desktop/build/nsniuniu/skin.zip'), archive)

// Still shipped even though no page shows it: InitSkinPage takes this file name as
// an argument and reads it during startup, so removing it would break the skin
// before the first page is laid out.
const licenseBytes = toGbk(LICENSE_TEXT)
await writeFile(path.join(root, 'packages/desktop/build/nsniuniu/license.txt'), licenseBytes)

console.log(`已生成 nsNiuniuSkin 皮肤：8 个页面、5 张位图，skin.zip ${archive.length} 字节；许可证文本 GBK ${licenseBytes.length} 字节。`)
