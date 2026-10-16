import { spawn, execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const require = createRequire(path.join(root, 'packages/desktop/package.json'))
const { chromium } = require('playwright')
const executable = path.resolve(process.argv[2] || path.join(root, 'dist/win-unpacked/YarkText.exe'))
const reportPath = path.resolve(process.argv[3] || path.join(root, '.cod-analysis/text-memory.json'))
const rounds = Number(process.argv[4] || 3)
if (process.platform !== 'win32') throw new Error('This measurement uses Windows private working set and private bytes')
if (!Number.isInteger(rounds) || rounds < 1) throw new Error('Rounds must be a positive integer')
await fs.mkdir(path.join(root, '.cod-analysis'), { recursive: true })
const workspace = await fs.mkdtemp(path.join(root, '.cod-analysis/text-memory-'))
const text = 'Small text document. 中文文本。\n'.repeat(160)
const markdown = '# Small Markdown\n\n' + 'A small **Markdown** paragraph. 中文文本。\n\n'.repeat(120)
await fs.writeFile(path.join(workspace, 'small.txt'), text)
await fs.writeFile(path.join(workspace, 'small.md'), markdown)
const scenarios = [
  { name: 'home', selector: '[data-testid="home-new-file"]' },
  { name: 'txt', file: 'small.txt', selector: '.plain-text-editor .CodeMirror' },
  { name: 'md-source', file: 'small.md', selector: '.source-code .CodeMirror', source: true },
  { name: 'md-rendered', file: 'small.md', selector: '.mu-editor' }
]
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(action, message) {
  const deadline = Date.now() + 45000
  let lastError
  while (Date.now() < deadline) {
    try { const result = await action(); if (result) return result } catch (error) { lastError = error }
    await delay(150)
  }
  throw new Error(`${message}: ${lastError?.message || ''}`)
}
function sample(pid) {
  // Creation times prevent an unrelated process from entering the tree after PID reuse.
  const script = `$ErrorActionPreference='Stop'; $root=Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}'; if (!$root) { throw 'Root exited' }; $all=@(Get-CimInstance Win32_Process); $ids=@{[uint32]$root.ProcessId=$root.CreationDate}; do { $changed=$false; foreach ($p in $all) { if (!$ids.ContainsKey([uint32]$p.ProcessId) -and $ids.ContainsKey([uint32]$p.ParentProcessId) -and $p.CreationDate -ge $ids[[uint32]$p.ParentProcessId]) { $ids[[uint32]$p.ProcessId]=$p.CreationDate; $changed=$true } } } while ($changed); $perf=@(Get-CimInstance Win32_PerfFormattedData_PerfProc_Process | Where-Object { $ids.ContainsKey([uint32]$_.IDProcess) }); $rows=@($perf | ForEach-Object { [pscustomobject]@{pid=$_.IDProcess; name=$_.Name; privateWorkingSet=[double]$_.WorkingSetPrivate; privateBytes=[double]$_.PrivateBytes} }); [pscustomobject]@{privateWorkingSet=($rows | Measure-Object privateWorkingSet -Sum).Sum; privateBytes=($rows | Measure-Object privateBytes -Sum).Sum; processes=$rows} | ConvertTo-Json -Depth 4 -Compress`
  return JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', timeout: 30000 }))
}
const report = {
  executable, startedAt: new Date().toISOString(), rounds,
  metric: 'Sum of Windows process-tree WorkingSetPrivate and PrivateBytes; no forced GC or working-set trimming',
  conditions: 'Release binary, isolated profiles, default preferences except explicit source mode, CDP used for readiness then disconnected before 15-second idle; two samples 5 seconds apart',
  files: { txtBytes: Buffer.byteLength(text), mdBytes: Buffer.byteLength(markdown) }, results: []
}
await fs.mkdir(path.dirname(reportPath), { recursive: true })
for (let round = 1; round <= rounds; round++) {
  for (const scenario of scenarios) {
    const profile = path.join(workspace, `${scenario.name}-${round}`)
    await fs.mkdir(profile)
    await fs.writeFile(path.join(profile, 'preferences.json'), JSON.stringify({ sourceCodeModeEnabled: !!scenario.source, startUpAction: 'blank', checkUpdatesOnStartup: false }))
    let child, browser, page
    let output = ''
    try {
      const env = { ...process.env }
      delete env.ELECTRON_RUN_AS_NODE
      child = spawn(executable, ['--user-data-dir', profile, '--remote-debugging-port=0', ...(scenario.file ? [path.join(workspace, scenario.file)] : [])], { env, stdio: ['ignore', 'pipe', 'pipe'] })
      child.stdout.on('data', data => { output += data })
      child.stderr.on('data', data => { output += data })
      child.on('error', error => { output += error.message })
      const port = await until(async () => (await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0], 'No debugging endpoint')
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`)
      page = await until(() => browser.contexts().flatMap(context => context.pages()).find(candidate => candidate.url().includes('index.html')), 'No editor page')
      await page.locator(scenario.selector).waitFor({ state: 'visible', timeout: 30000 })
      if (scenario.file) await until(() => page.evaluate(() => {
        const store = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('editor')
        return store.currentFile?.isSaved && store.currentFile?.markdown?.length > 0
      }), 'Document not ready')
      const diagnostics = await page.evaluate(() => ({
        resources: performance.getEntriesByType('resource').map(entry => entry.name.split('/').at(-1)),
        jsHeapUsed: performance.memory?.usedJSHeapSize,
        muyaInstances: document.querySelectorAll('.mu-editor').length,
        codeMirrorInstances: document.querySelectorAll('.CodeMirror').length
      }))
      await browser.close()
      browser = undefined
      await delay(15000)
      const samples = [sample(child.pid)]
      await delay(5000)
      samples.push(sample(child.pid))
      report.results.push({ round, scenario: scenario.name, diagnostics, samples })
      await fs.writeFile(reportPath, JSON.stringify(report, null, 2))
      console.log(`${scenario.name} round ${round}: ${(samples[1].privateWorkingSet / 1048576).toFixed(1)} MiB private WS; ${(samples[1].privateBytes / 1048576).toFixed(1)} MiB private bytes`)
    } catch (error) {
      throw new Error(`${scenario.name} round ${round}: ${error.message}\n${output.slice(-3000)}`)
    } finally {
      if (browser) await browser.close().catch(() => {})
      if (child && child.exitCode === null) {
        child.kill()
        await Promise.race([new Promise(resolve => child.once('exit', resolve)), delay(5000)])
      }
    }
  }
}
report.finishedAt = new Date().toISOString()
report.summary = scenarios.map(scenario => {
  const values = report.results.filter(result => result.scenario === scenario.name).map(result => result.samples[1])
  const median = key => { const sorted = values.map(value => value[key] / 1048576).sort((a, b) => a - b); const mid = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2 }
  return { scenario: scenario.name, medianPrivateWorkingSetMiB: median('privateWorkingSet'), medianPrivateBytesMiB: median('privateBytes') }
})
await fs.writeFile(reportPath, JSON.stringify(report, null, 2))
await fs.rm(workspace, { recursive: true, force: true })
console.log(JSON.stringify(report.summary, null, 2))
