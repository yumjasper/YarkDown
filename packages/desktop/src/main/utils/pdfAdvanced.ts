import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import type { PdfAdvancedCapabilities, PdfBlockInspection } from '@shared/pdf'

export interface PdfEngineRequest {
  action: 'capabilities' | 'inspect' | 'edit' | 'ocr' | 'convert'
  input?: string
  output?: string
  page?: number
  blockId?: number
  text?: string
  fontSize?: number
  sourceHash?: string
  kind?: 'docx' | 'xlsx' | 'pptx'
}

export const locatePdfEngine = () => {
  const base = app.getAppPath()
  const executable = process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python'
  const python =
    process.env.YARKTEXT_PDF_PYTHON ||
    [
      path.join(base, '.tools/pdf-engine', executable),
      path.resolve(base, '../../.tools/pdf-engine', executable),
      path.join(process.resourcesPath, 'pdf-engine-runtime', executable)
    ].find(existsSync)
  const script = app.isPackaged
    ? path.join(process.resourcesPath, 'static/pdf-engine/engine.py')
    : path.join(base, 'static/pdf-engine/engine.py')
  if (!python || !existsSync(python) || !existsSync(script))
    throw new Error(
      '本地 PDF 引擎未安装。运行 scripts/setup-pdf-engine.ps1 或配置 YARKTEXT_PDF_PYTHON。 / Local PDF engine is unavailable.'
    )
  return { python, script }
}

let active = false

// A task owns one process; no native engine or inference model stays resident between tasks.
export const runPdfEngine = async <T>(request: PdfEngineRequest): Promise<T> => {
  if (active) throw new Error('PDF 引擎正在处理其他任务，请稍后重试。 / PDF engine is busy.')
  const { python, script } = locatePdfEngine()
  active = true
  try {
    return await new Promise<T>((resolve, reject) => {
      const child = spawn(python, ['-u', script], {
        windowsHide: true,
        shell: false,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8', OMP_NUM_THREADS: '2' },
        stdio: ['pipe', 'pipe', 'pipe']
      })
      let stdout = ''
      let stderr = ''
      let failure: Error | undefined
      const timer = setTimeout(
        () => {
          failure = new Error('PDF processing exceeded 15 minutes.')
          child.kill()
        },
        15 * 60 * 1000
      )
      child.stdout.setEncoding('utf8')
      child.stderr.setEncoding('utf8')
      child.stdout.on('data', (chunk: string) => {
        stdout += chunk
        if (stdout.length > 16 * 1024 * 1024) {
          failure = new Error('PDF engine response exceeds 16 MB.')
          child.kill()
        }
      })
      child.stderr.on('data', (chunk: string) => {
        stderr = (stderr + chunk).slice(-8192)
      })
      child.stdin.on('error', () => {})
      child.on('error', (error) => {
        clearTimeout(timer)
        reject(error)
      })
      child.on('close', (code) => {
        clearTimeout(timer)
        let result: T | undefined
        for (const line of stdout.split('\n')) {
          try {
            const entry = JSON.parse(line) as { result?: T; error?: string }
            if (entry.error) failure = new Error(entry.error)
            if ('result' in entry) result = entry.result
          } catch {
            // Conversion dependencies may write non-protocol diagnostic lines to stdout.
          }
        }
        if (failure || code !== 0 || result === undefined)
          reject(failure || new Error(stderr || 'PDF engine exited without a result.'))
        else resolve(result)
      })
      child.stdin.end(`${JSON.stringify(request)}\n`)
    })
  } finally {
    active = false
  }
}

export const inspectPdfBlocks = (input: string, page: number) =>
  runPdfEngine<PdfBlockInspection>({ action: 'inspect', input, page })

export const pdfEngineCapabilities = async(): Promise<PdfAdvancedCapabilities> => {
  try {
    return {
      available: true,
      ...(await runPdfEngine<Omit<PdfAdvancedCapabilities, 'available'>>({
        action: 'capabilities'
      }))
    }
  } catch (error) {
    return { available: false, error: error instanceof Error ? error.message : String(error) }
  }
}
