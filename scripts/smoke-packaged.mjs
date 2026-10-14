import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const require = createRequire(path.join(root, 'packages/desktop/package.json'))
const { chromium } = require('playwright')
const executable = process.argv[2] || path.join(root, 'dist/win-unpacked/marktext.exe')
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'yarkdown-pack-smoke-'))
const userData = path.join(temporary, 'profile')
const folder = path.join(temporary, 'notes')
await fs.mkdir(folder)
await fs.writeFile(path.join(folder, 'quick-target.md'), '# Search target\n\nPackaged search works.\n')
let child
let browser
let output = ''

async function until (action, message, timeout = 30000) {
  const deadline = Date.now() + timeout
  let error
  while (Date.now() < deadline) {
    try {
      const result = await action()
      if (result) return result
    } catch (caught) {
      error = caught
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`${message}: ${error?.message || output.slice(-2000)}`)
}

async function execute (page, id) {
  await page.evaluate(async (commandId) => {
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia
    const command = pinia._s.get('commandCenter').rootCommand.subcommands
      .find((entry) => entry.id === commandId)
    if (!command) throw new Error(`Missing command: ${commandId}`)
    await command.execute()
  }, id)
}

try {
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  delete env.npm_config_arch
  child = spawn(executable, [
    '--user-data-dir', userData,
    '--remote-debugging-port=0',
    folder
  ], { env, stdio: ['ignore', 'pipe', 'pipe'] })
  child.stdout.on('data', (data) => { output += data })
  child.stderr.on('data', (data) => { output += data })
  child.on('error', (error) => { output += error.message })

  // Chromium CDP checks the release binary without changing its production
  // fuses, which intentionally disable the main-process Node inspector.
  const port = await until(async () => {
    const value = await fs.readFile(path.join(userData, 'DevToolsActivePort'), 'utf8')
    return value.split('\n')[0]
  }, 'Packaged app did not expose its renderer')
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`)
  const page = await until(() => browser.contexts().flatMap((context) => context.pages())
    .find((candidate) => candidate.url().includes('index.html')), 'No editor window')
  await until(async () => await page.locator('.tree-wrapper .side-bar-file').count() > 0,
    'Project folder did not load')
  await until(() => page.evaluate(() => {
    const pinia = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia
    return pinia._s.get('commandCenter').rootCommand.subcommands
      .some((command) => command.id === 'file.quick-open')
  }), 'Quick open was not registered')
  console.log('[smoke] Packaged editor started')

  // CDP synthetic keyboard input bypasses Electron before-input-event on
  // Windows. Exercise the registered commands here; unit tests cover their
  // accelerator assignments and conflicts separately.
  await execute(page, 'file.quick-open')
  const search = page.locator('input.search').first()
  await search.waitFor({ state: 'visible' })
  await search.fill('quick-target')
  await search.press('End')
  await until(async () => (await page.locator('.commands').innerText()).includes('quick-target.md'),
    'Quick open did not find a file in the opened folder')
  await page.keyboard.press('Enter')
  await page.waitForSelector('.editor-component h1', { state: 'attached' })
  console.log('[smoke] File-name search opened quick-target.md')

  await execute(page, 'view.source-code-mode')
  await page.waitForSelector('.source-code .CodeMirror', { state: 'visible' })
  await execute(page, 'view.source-code-mode')
  await until(async () => await page.locator('.source-code').count() === 0,
    'Source mode did not return to rendered editing')
  console.log('[smoke] Source/rendered mode toggled in both directions')

  for (let level = 1; level <= 6; level++) {
    await page.locator('.editor-component :is(h1,h2,h3,h4,h5,h6)').first().click()
    await execute(page, `paragraph.heading-${level}`)
    await page.waitForSelector(`.editor-component h${level}`, { state: 'attached' })
  }
  console.log('[smoke] All six heading commands passed')
  console.log('[smoke] All release checks passed')
} finally {
  if (browser) await browser.close().catch(() => {})
  if (child && child.exitCode === null) {
    child.kill()
    await Promise.race([
      new Promise((resolve) => child.once('exit', resolve)),
      new Promise((resolve) => setTimeout(resolve, 3000))
    ])
  }
  await fs.rm(temporary, { recursive: true, force: true }).catch(() => {})
}
