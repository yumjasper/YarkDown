import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { BuildProgress } from './build-progress.mjs'

test('构建日志保留输出且失败不会显示完成', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'yark-build-test-'))
  let text = ''
  const progress = new BuildProgress(2, { write: value => { text += value } })
  const logPath = path.join(directory, 'build.log')
  try {
    await progress.run('成功步骤', process.execPath, ['-e', 'console.log("output-marker")'], { logPath })
    assert.match(text, /阶段 1\/2/)
    assert.match(text, /output-marker/)
    await assert.rejects(progress.run('失败步骤', process.execPath, ['-e', 'process.exit(9)'], { logPath }), /退出码 9/)
    assert.doesNotMatch(text, /\[完成\] 失败步骤/)
    assert.match(fs.readFileSync(logPath, 'utf8'), /output-marker/)
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('命令不存在时退出并释放进度计时器', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'yark-build-error-'))
  try {
    const progress = new BuildProgress(1, { write () {} })
    await assert.rejects(progress.run('缺失命令', path.join(directory, 'missing'), [], { logPath: path.join(directory, 'log') }), /ENOENT/)
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})
