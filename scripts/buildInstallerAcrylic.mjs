import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = path.join(root, 'packages/desktop/build/acrylic')
if (process.platform !== 'win32') {
  throw new Error('Acrylic 安装器需在 Windows 上使用 Visual Studio C++ 工具链构建')
}
for (const args of [
  ['-S', source, '-B', path.join(source, 'out'), '-A', 'Win32'],
  ['--build', path.join(source, 'out'), '--config', 'Release']
]) {
  const result = spawnSync('cmake', args, { cwd: root, stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`Acrylic 插件编译失败：${result.status}`)
}
