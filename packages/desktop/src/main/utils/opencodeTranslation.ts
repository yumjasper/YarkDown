import { execFile, spawn } from 'node:child_process'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { openCodeTranslationLanguages, openCodeTranslationPrompt } from '../../shared/openCodeTranslation'
import type { OpenCodeTranslationRequest, OpenCodeTranslationResult } from '@shared/types/opencode'

const failure = (code: Exclude<OpenCodeTranslationResult, { ok: true }>['code'], error: string): OpenCodeTranslationResult => ({ ok: false, code, error })
export const isTranslationRequest = (request: unknown): request is OpenCodeTranslationRequest => {
  if (!request || typeof request !== 'object') return false
  const value = request as Partial<OpenCodeTranslationRequest>
  return typeof value.source === 'string' && value.source.trim().length > 0 && value.source.length <= 30000 &&
    typeof value.target === 'string' && Object.hasOwn(openCodeTranslationLanguages, value.target) &&
    typeof value.model === 'string' && /^[^/#\s]+\/[^#\s]+$/.test(value.model)
}

export const parseTranslationOutput = (output: string, exitCode: number | null): OpenCodeTranslationResult => {
  const parts: string[] = []
  let failed = exitCode !== 0
  for (const line of output.split(/\r?\n/)) {
    if (!line.trim()) continue
    let event: { type?: string; part?: { text?: unknown }; error?: { message?: unknown; type?: unknown } }
    try { event = JSON.parse(line) } catch { continue }
    if (!event || typeof event !== 'object') continue
    if (event.type === 'error') {
      const message = typeof event.error?.message === 'string' ? event.error.message : ''
      if (/free tier can only be used from within opencode/i.test(message))
        return failure('restricted', 'OpenCode 拒绝了免费模型的 CLI 自动调用。请使用官方界面手动翻译。 / OpenCode declined automated CLI use of this free model. Use the official UI manually.')
      failed = true
    }
    if (event.type === 'text' && typeof event.part?.text === 'string') parts.push(event.part.text)
  }
  if (failed || !parts.join('').trim())
    return failure('failed', 'CLI 未返回有效译文，请检查 OpenCode 的模型可用性和登录状态。 / The CLI returned no valid translation. Check model availability and sign-in in OpenCode.')
  return { ok: true, text: parts.join('').trim() }
}

interface RunOptions {
  cwd: string
  prompt: string
  model: string
  signal: AbortSignal
}
type TranslationRunner = (command: string, options: RunOptions) => Promise<OpenCodeTranslationResult>

const executeTranslation: TranslationRunner = (command, options) => new Promise(resolve => {
  if (options.signal.aborted) { resolve(failure('cancelled', '已取消 / Cancelled')); return }
  let output = '', size = 0, timedOut = false, overflow = false, launchFailed = false
  let session: string | undefined
  let interrupted = false
  const interrupt = () => {
    if (interrupted || !session) return
    interrupted = true
    // Interrupt only the session created by this request; killing the CLI alone
    // can leave generation running in OpenCode's shared background service.
    execFile(command, ['api', 'POST', `/api/session/${session}/interrupt`], {
      cwd: options.cwd, windowsHide: true, shell: false, timeout: 5000, maxBuffer: 16384
    }, () => {})
  }
  const child = spawn(command, ['run', '--format', 'json', '--model', options.model, '--agent', 'build'], {
    cwd: options.cwd, windowsHide: true, shell: false, signal: options.signal, stdio: ['pipe', 'pipe', 'pipe']
  })
  options.signal.addEventListener('abort', interrupt, { once: true })
  const timer = setTimeout(() => { timedOut = true; interrupt(); child.kill() }, 120000)
  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (chunk: string) => {
    size += Buffer.byteLength(chunk)
    if (size > 2 * 1024 * 1024) { overflow = true; interrupt(); child.kill() }
    else {
      output += chunk
      if (!session) {
        for (const line of output.split(/\r?\n/)) {
          try {
            const record = JSON.parse(line)
            if (typeof record?.sessionID === 'string' && /^ses_[a-z0-9]{1,80}$/i.test(record.sessionID)) {
              session = record.sessionID
              break
            }
          } catch { /* The last JSON line can span multiple stdout chunks. */ }
        }
      }
    }
  })
  child.stderr.resume()
  child.stdin.on('error', () => {})
  child.stdin.end(options.prompt)
  child.once('error', () => { launchFailed = true })
  child.once('close', code => {
    clearTimeout(timer)
    options.signal.removeEventListener('abort', interrupt)
    if (options.signal.aborted) resolve(failure('cancelled', '已取消 / Cancelled'))
    else if (launchFailed) resolve(failure('unavailable', '无法启动 OpenCode CLI。 / Could not launch OpenCode CLI.'))
    else if (timedOut) resolve(failure('timeout', '翻译超时，请稍后重试。 / Translation timed out. Retry later.'))
    else if (overflow) resolve(failure('failed', 'CLI 输出超过上限。 / CLI output exceeded the size limit.'))
    else resolve(parseTranslationOutput(output, code))
  })
})

export const translateWithOpenCode = async(
  command: string, request: OpenCodeTranslationRequest, signal: AbortSignal,
  run: TranslationRunner = executeTranslation
): Promise<OpenCodeTranslationResult> => {
  if (!isTranslationRequest(request)) return failure('failed', '请选择有效语言及模型，原文限 30,000 字符。 / Choose a valid language and model. Source limit: 30,000 characters.')
  if (signal.aborted) return failure('cancelled', '已取消 / Cancelled')
  const directory = await mkdtemp(path.join(os.tmpdir(), 'yarktext-translation-'))
  try {
    // Keep the built-in agent and scope reads to this disposable workspace.
    // PDF instructions cannot grant shell, edit, or document access.
    await writeFile(path.join(directory, 'opencode.json'), JSON.stringify({ agents: {
      build: {
        permissions: [
          { action: '*', resource: '*', effect: 'deny' },
          { action: 'read', resource: `${directory}/**`, effect: 'allow' }
        ]
      }
    } }))
    if (signal.aborted) return failure('cancelled', '已取消 / Cancelled')
    return await run(command, { cwd: directory, prompt: openCodeTranslationPrompt(request.source, request.target), model: request.model, signal })
  } catch {
    return signal.aborted ? failure('cancelled', '已取消 / Cancelled') : failure('failed', 'CLI 翻译失败，请在 OpenCode 中检查服务。 / CLI translation failed. Check the service in OpenCode.')
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => {})
  }
}
