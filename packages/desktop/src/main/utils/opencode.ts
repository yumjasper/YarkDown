import { execFile } from 'node:child_process'
import { access, readFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { promisify } from 'node:util'
import { ensureShellEnvPath } from '../app/envPath'
import type { OpenCodeModel, OpenCodeStatus } from '@shared/types/opencode'

const execute = promisify(execFile)
type JsonObject = Record<string, unknown>
const object = (value: unknown): JsonObject =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : {}

const records = (output: string): JsonObject[] => {
  let data: unknown
  try {
    data = object(JSON.parse(output.replace(/^\uFEFF/, ''))).data
  } catch {
    throw new Error('OpenCode returned an unsupported API response.')
  }
  if (!Array.isArray(data)) throw new Error('OpenCode returned an unsupported API response.')
  return data.map(object)
}

export const parseFreeOpenCodeModels = (output: string): OpenCodeModel[] =>
  records(output)
    .filter((model) => {
      const capabilities = object(model.capabilities)
      return (
        model.enabled === true &&
        model.status === 'active' &&
        Array.isArray(capabilities.input) &&
        capabilities.input.includes('text') &&
        Array.isArray(capabilities.output) &&
        capabilities.output.includes('text') &&
        Array.isArray(model.cost) &&
        model.cost.length > 0 &&
        model.cost.every((cost) => object(cost).input === 0 && object(cost).output === 0)
      )
    })
    .flatMap((model) =>
      typeof model.id === 'string' && typeof model.providerID === 'string'
        ? [
          {
            id: `${model.providerID}/${model.id}`,
            name: String(model.name || model.id),
            provider: model.providerID
          }
        ]
        : []
    )

export const parseOpenCodeProviders = (output: string): string[] =>
  records(output)
    .filter((provider) => Array.isArray(provider.connections) && provider.connections.length > 0)
    .map((provider) => String(provider.name || provider.id))

export const openCodeCandidates = (
  platform: string,
  env: NodeJS.ProcessEnv,
  home: string
): string[] => {
  const executable = platform === 'win32' ? 'opencode.exe' : 'opencode'
  const delimiter = platform === 'win32' ? ';' : ':'
  const paths = (env.PATH || '')
    .split(delimiter)
    .filter(Boolean)
    .map((dir) => path.join(dir, executable))
  if (platform === 'win32') {
    if (env.APPDATA)
      paths.push(path.join(env.APPDATA, 'npm/node_modules/@opencode/cli/bin/opencode.exe'))
    if (env.LOCALAPPDATA)
      paths.push(
        path.join(env.LOCALAPPDATA, 'Programs/@opencodedesktop/resources/opencode-cli.exe')
      )
    paths.push(path.join(home, '.opencode/bin/opencode.exe'))
  } else {
    paths.push(path.join(home, '.opencode/bin/opencode'), path.join(home, '.local/bin/opencode'))
    if (platform === 'darwin')
      paths.push(
        '/opt/homebrew/bin/opencode',
        '/usr/local/bin/opencode',
        '/Applications/OpenCode.app/Contents/Resources/opencode-cli',
        path.join(home, 'Applications/OpenCode.app/Contents/Resources/opencode-cli')
      )
    else
      paths.push(
        '/usr/local/bin/opencode',
        '/usr/bin/opencode',
        '/opt/OpenCode/resources/opencode-cli'
      )
  }
  return [...new Set(paths)]
}

export const runOpenCode = async(command: string, args: string[]): Promise<string> => {
  try {
    const { stdout } = await execute(command, args, {
      cwd: os.tmpdir(),
      windowsHide: true,
      timeout: 30000,
      maxBuffer: 8 * 1024 * 1024,
      encoding: 'utf8',
      shell: false
    })
    return stdout
  } catch {
    // Model API responses may include provider credentials. Never forward raw
    // subprocess output to renderer errors or logs.
    throw new Error(
      '无法读取 OpenCode 状态，请在终端运行 opencode models 检查服务。 / Cannot read OpenCode status. Run opencode models in a terminal.'
    )
  }
}

export const inspectOpenCode = async(
  command: string,
  run: (command: string, args: string[]) => Promise<string> = runOpenCode
): Promise<OpenCodeStatus> => {
  const status: OpenCodeStatus = {
    state: 'error',
    platform: process.platform,
    arch: process.arch,
    command,
    authentication: 'unknown',
    providers: [],
    freeModels: []
  }
  try {
    const version = (await run(command, ['--version'])).trim()
    if (!/^(?:opencode\s+v?)?\d+\.\d+/i.test(version))
      throw new Error('所选文件不是 OpenCode CLI。 / This file is not an OpenCode CLI.')
    status.version = version
    if (!/^(?:opencode\s+v?)?2\./i.test(version)) return { ...status, state: 'upgrade' }
    const [models, providers] = await Promise.allSettled([
      run(command, ['api', 'GET', '/api/model']),
      run(command, ['api', 'GET', '/api/integration'])
    ])
    if (models.status === 'rejected') throw models.reason
    status.freeModels = parseFreeOpenCodeModels(models.value)
    if (providers.status === 'fulfilled') {
      try {
        status.providers = parseOpenCodeProviders(providers.value)
        status.authentication = status.providers.length ? 'signed-in' : 'not-signed-in'
      } catch {
        /* Authentication detection must not hide an available model catalog. */
      }
    }
    return { ...status, state: 'ready' }
  } catch (error) {
    return {
      ...status,
      error: error instanceof Error ? error.message : 'OpenCode detection failed.'
    }
  }
}

export const detectOpenCode = async(settingsFile: string): Promise<OpenCodeStatus> => {
  let override = process.env.YARKTEXT_OPENCODE
  if (!override) {
    try {
      const saved = object(JSON.parse(await readFile(settingsFile, 'utf8'))).command
      if (typeof saved === 'string') override = saved
    } catch { override = undefined }
  }
  await ensureShellEnvPath()
  const candidates = override
    ? [override]
    : openCodeCandidates(process.platform, process.env, os.homedir())
  let fallback: OpenCodeStatus | undefined
  for (const candidate of candidates) {
    if (!path.isAbsolute(candidate)) continue
    try {
      await access(candidate, constants.X_OK)
    } catch {
      continue
    }
    const status = await inspectOpenCode(candidate)
    if (status.state === 'ready') return status
    fallback ??= status
  }
  if (fallback) return fallback
  return {
    state: 'missing',
    platform: process.platform,
    arch: process.arch,
    authentication: 'unknown',
    providers: [],
    freeModels: []
  }
}
