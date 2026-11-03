import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import afterPack, { validatePackagedResources } from '../packages/desktop/build/validate-packaged-resources.mjs'

function fixture (t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'yarktext-resources-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const resources = path.join(root, 'resources')
  fs.mkdirSync(path.join(resources, 'static', 'locales'), { recursive: true })
  fs.mkdirSync(path.join(resources, 'icons'), { recursive: true })
  fs.writeFileSync(path.join(resources, 'static', 'preference.json'), '{"theme":"light"}')
  fs.writeFileSync(path.join(resources, 'static', 'icon.ico'), 'icon')
  fs.writeFileSync(path.join(resources, 'icons', 'md.ico'), 'icon')
  for (const locale of ['de', 'en', 'es', 'fr', 'ja', 'ko', 'nl', 'pt', 'ru', 'tr', 'zh-CN', 'zh-TW']) {
    fs.writeFileSync(path.join(resources, 'static', 'locales', `${locale}.min.json`), '{"test":"value"}')
  }
  return { root, resources }
}

test('accepts a complete Windows package', t => {
  const { root } = fixture(t)
  assert.doesNotThrow(() => afterPack({ appOutDir: root, electronPlatformName: 'win32' }))
})

test('rejects missing static resources', t => {
  const { resources } = fixture(t)
  fs.rmSync(path.join(resources, 'static'), { recursive: true })
  assert.throws(() => validatePackagedResources(resources), /missing or empty/)
})

test('rejects missing association icons', t => {
  const { resources } = fixture(t)
  fs.unlinkSync(path.join(resources, 'icons', 'md.ico'))
  assert.throws(() => validatePackagedResources(resources), /md\.ico/)
})

test('rejects malformed defaults and invalid locale objects', t => {
  const { resources } = fixture(t)
  const defaults = path.join(resources, 'static', 'preference.json')
  fs.writeFileSync(defaults, '{')
  assert.throws(() => validatePackagedResources(resources), SyntaxError)
  fs.writeFileSync(defaults, '{"theme":"light"}')
  for (const invalid of ['', '{}', '[]', 'null', '42']) {
    fs.writeFileSync(path.join(resources, 'static', 'locales', 'zh-CN.min.json'), invalid)
    assert.throws(() => validatePackagedResources(resources))
  }
})

test('resolves macOS bundle resources', t => {
  const { root, resources } = fixture(t)
  const target = path.join(root, 'YarkText.app', 'Contents', 'Resources')
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.renameSync(resources, target)
  assert.doesNotThrow(() => afterPack({
    appOutDir: root,
    electronPlatformName: 'darwin',
    packager: { appInfo: { productFilename: 'YarkText' } }
  }))
})
