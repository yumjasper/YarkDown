import { spawn } from 'node:child_process'
import fs from 'node:fs'

export class BuildProgress {
  constructor (total = 7, output = process.stdout) {
    this.total = total
    this.output = output
    this.stage = 0
    this.started = Date.now()
  }

  start (title) {
    this.stage = title === 'Done' ? this.total : Math.min(this.total, this.stage + 1)
    const filled = Math.round(this.stage / this.total * 24)
    this.output.write(`\n[${'#'.repeat(filled)}${'-'.repeat(24 - filled)}] 阶段 ${this.stage}/${this.total} · ${title}\n`)
  }

  async run (label, command, args, options) {
    this.start(label)
    const started = Date.now()
    const log = fs.createWriteStream(options.logPath, { flags: 'a' })
    await new Promise((resolve, reject) => {
      let settled = false
      const child = spawn(command, args, { cwd: options.cwd, env: options.env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
      const forward = data => { log.write(data); this.output.write(data) }
      child.stdout.on('data', forward)
      child.stderr.on('data', forward)
      const timer = setInterval(() => {
        if (this.output.isTTY) this.output.write(`\n[进行中] ${label} · 已用 ${Math.floor((Date.now() - started) / 1000)} 秒\n`)
      }, 10000)
      const finish = error => {
        if (settled) return
        settled = true
        clearInterval(timer)
        log.end(() => {
          if (error) reject(error)
          else resolve()
        })
      }
      child.once('error', finish)
      child.once('close', code => finish(code === 0 ? null : new Error(`${label} 失败，退出码 ${code}；日志：${options.logPath}`)))
    })
    this.output.write(`[完成] ${label} · ${((Date.now() - started) / 1000).toFixed(1)} 秒\n`)
  }
}
