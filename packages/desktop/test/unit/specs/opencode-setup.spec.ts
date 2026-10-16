import { describe, expect, it, vi } from 'vitest'
import {
  inspectOpenCode,
  openCodeCandidates,
  parseFreeOpenCodeModels,
  parseOpenCodeProviders
} from '../../../src/main/utils/opencode'

const model = {
  id: 'deepseek-v4.1-flash-free',
  providerID: 'opencode',
  name: 'DeepSeek V4.1 Flash',
  enabled: true,
  status: 'active',
  cost: [{ input: 0, output: 0 }],
  capabilities: { input: ['text'], output: ['text'] },
  settings: { apiKey: 'never-expose-this' }
}
const response = (data: unknown) => JSON.stringify({ data })

describe('OpenCode setup', () => {
  it('only exposes active, enabled, zero-price text models without provider credentials', () => {
    const models = parseFreeOpenCodeModels(
      response([
        model,
        { ...model, id: 'paid', cost: [{ input: 1, output: 0 }] },
        { ...model, id: 'unknown-price', cost: [] },
        { ...model, id: 'disabled', enabled: false },
        { ...model, id: 'retired', status: 'deprecated' },
        { ...model, id: 'image-only', capabilities: { input: ['image'], output: ['image'] } }
      ])
    )
    expect(models).toEqual([
      { id: 'opencode/deepseek-v4.1-flash-free', name: model.name, provider: 'opencode' }
    ])
    expect(JSON.stringify(models)).not.toContain('never-expose-this')
  })

  it('never reveals response fragments when the API returns malformed data', () => {
    expect(() => parseFreeOpenCodeModels('{"apiKey":"secret",')).toThrow('unsupported API response')
    expect(() => parseFreeOpenCodeModels('{"apiKey":"secret",')).not.toThrow('secret')
    expect(() => parseFreeOpenCodeModels('{}')).toThrow('unsupported API response')
  })

  it('keeps public free models available when no provider is signed in', async() => {
    const run = vi.fn(async(_command: string, args: string[]) => {
      if (args[0] === '--version') return 'opencode v2.0.30'
      return response(args.at(-1) === '/api/model' ? [model] : [])
    })
    const status = await inspectOpenCode('opencode', run)
    expect(status.state).toBe('ready')
    expect(status.authentication).toBe('not-signed-in')
    expect(status.freeModels).toHaveLength(1)
    expect(run.mock.calls.map((call) => call[1])).toEqual([
      ['--version'],
      ['api', 'GET', '/api/model'],
      ['api', 'GET', '/api/integration']
    ])
  })

  it('does not mistake a failed login check for a signed-out account', async() => {
    const run = async(_command: string, args: string[]) => {
      if (args[0] === '--version') return '2.0.30'
      if (args.at(-1) === '/api/model') return response([model])
      throw new Error('unavailable')
    }
    const status = await inspectOpenCode('opencode', run)
    expect(status.authentication).toBe('unknown')
    expect(status.freeModels).toHaveLength(1)
  })

  it('reports login records without exposing credential contents', () => {
    expect(
      parseOpenCodeProviders(
        response([
          { id: 'opencode', name: 'OpenCode', connections: [{ secret: 'hidden' }] },
          { id: 'other', connections: [] }
        ])
      )
    ).toEqual(['OpenCode'])
  })

  it('gives v1 users an upgrade state without calling incompatible APIs', async() => {
    const run = vi.fn(async() => '1.2.0')
    expect((await inspectOpenCode('opencode', run)).state).toBe('upgrade')
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('finds desktop-bundled Windows CLIs and common macOS/Linux installs', () => {
    expect(
      openCodeCandidates(
        'win32',
        { LOCALAPPDATA: 'C:/Users/test/AppData/Local' },
        'C:/Users/test'
      ).some((file) =>
        file.replaceAll('\\', '/').endsWith('@opencodedesktop/resources/opencode-cli.exe')
      )
    ).toBe(true)
    expect(openCodeCandidates('darwin', {}, '/Users/test')).toContain('/opt/homebrew/bin/opencode')
    expect(
      openCodeCandidates('linux', {}, '/home/test').map((file) => file.replaceAll('\\', '/'))
    ).toContain('/home/test/.opencode/bin/opencode')
  })
})
