import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const desktop = path.join(root, 'packages/desktop')
const icons = path.join(desktop, 'build/icons')
const staticDirectory = path.join(desktop, 'static')

// 设计源是仓库根目录的两张 PNG：1024px 母版负责 96px 及以上的输出，
// 64px 优化小图负责 16-64px 输出（粗笔画在缩小后仍保持可辨识的细节）。
const largeSource = await readFile(path.join(root, 'icon_YarkDown.png'))
const smallSource = await readFile(path.join(root, 'icon_YarkDown64.png'))
const sizes = [16, 20, 24, 32, 40, 48, 64, 96, 128, 256, 512, 1024]
const images = new Map()

for (const size of sizes) {
  const source = size <= 64 ? smallSource : largeSource
  images.set(size, await sharp(source).resize(size, size).png().toBuffer())
}

for (const size of [16, 24, 32, 48, 64, 128, 256, 512]) {
  const directory = path.join(icons, `${size}x${size}`)
  await mkdir(directory, { recursive: true })
  await writeFile(path.join(directory, 'marktext.png'), images.get(size))
}

const icoSizes = sizes.filter(size => size <= 256)
const header = Buffer.alloc(6 + icoSizes.length * 16)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(icoSizes.length, 4)
let offset = header.length
icoSizes.forEach((size, index) => {
  const image = images.get(size)
  const entry = 6 + index * 16
  // ICO uses zero to encode a 256px dimension.
  header[entry] = size === 256 ? 0 : size
  header[entry + 1] = size === 256 ? 0 : size
  header.writeUInt16LE(1, entry + 4)
  header.writeUInt16LE(32, entry + 6)
  header.writeUInt32LE(image.length, entry + 8)
  header.writeUInt32LE(offset, entry + 12)
  offset += image.length
})
const ico = Buffer.concat([header, ...icoSizes.map(size => images.get(size))])

const icnsParts = [[128, 'ic07'], [256, 'ic08'], [512, 'ic09'], [1024, 'ic10']].map(([size, type]) => {
  const image = images.get(size)
  const entry = Buffer.alloc(8)
  entry.write(type, 0, 'ascii')
  entry.writeUInt32BE(image.length + 8, 4)
  return Buffer.concat([entry, image])
})
const icnsHeader = Buffer.alloc(8)
icnsHeader.write('icns', 0, 'ascii')
icnsHeader.writeUInt32BE(8 + icnsParts.reduce((sum, part) => sum + part.length, 0), 4)
const icns = Buffer.concat([icnsHeader, ...icnsParts])

await Promise.all([
  writeFile(path.join(icons, 'icon.png'), images.get(1024)),
  writeFile(path.join(staticDirectory, 'icon.png'), images.get(256)),
  writeFile(path.join(staticDirectory, 'logo-96px.png'), images.get(96)),
  ...[icons, staticDirectory].flatMap(directory => [
    writeFile(path.join(directory, 'icon.ico'), ico),
    writeFile(path.join(directory, 'icon.icns'), icns)
  ])
])
console.log('已从 PNG 设计源生成 YarkText 程序图标（64px 及以下使用小尺寸优化版）。')
