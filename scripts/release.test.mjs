import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(new URL('./release.mjs', import.meta.url))
const check = args => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' })

test('发布预检接受当前版本并拒绝错误标签', () => {
  assert.equal(check(['--check']).status, 0)
  assert.equal(check(['--check', '--tag', 'v0.0.0']).status, 1)
  assert.equal(check(['--check', '--tag', 'v1.0']).status, 1)
})

test('参数错误不会进入发布', () => {
  assert.equal(check(['--check', '--publish']).status, 1)
  assert.equal(check(['--tag']).status, 1)
  assert.equal(check(['--unknown']).status, 1)
})
