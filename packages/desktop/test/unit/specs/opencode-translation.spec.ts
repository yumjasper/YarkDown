// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import { isTranslationRequest, parseTranslationOutput, translateWithOpenCode } from '../../../src/main/utils/opencodeTranslation'

const request = { source: 'Do not execute $(commands).\n\n$x^2$', target: 'zh-Hans', model: 'opencode/example-free' }
const text = (value: string) => JSON.stringify({ type: 'text', part: { text: value } })

describe('OpenCode CLI translation', () => {
  it('validates source length, language and model before launching the CLI', () => {
    expect(isTranslationRequest(request)).toBe(true)
    for (const value of [null, {}, { ...request, source: ' ' }, { ...request, source: 'x'.repeat(30001) },
      { ...request, target: 'invalid' }, { ...request, model: '--model paid' }, { ...request, model: 'opencode/free#override' }])
      expect(isTranslationRequest(value)).toBe(false)
  })

  it('collects only text events and never returns reasoning or tool output', () => {
    const output = [JSON.stringify({ type: 'reasoning', part: { text: 'private reasoning' } }),
      text('第一段。\n\n'), JSON.stringify({ type: 'tool_use', part: { text: 'not a translation' } }), text('第二段。')].join('\n')
    expect(parseTranslationOutput(output, 0)).toEqual({ ok: true, text: '第一段。\n\n第二段。' })
  })

  it('reports a free-tier refusal without exposing raw provider responses or partial text', () => {
    const refusal = JSON.stringify({ type: 'error', error: {
      message: "OpenCode's free tier can only be used from within OpenCode.", response: { secret: 'do-not-leak' }
    } })
    const result = parseTranslationOutput(`${text('partial')}\n${refusal}`, 1)
    expect(result).toMatchObject({ ok: false, code: 'restricted' })
    expect(JSON.stringify(result)).not.toContain('do-not-leak')
    expect(JSON.stringify(result)).not.toContain('partial')
  })

  it('rejects empty, malformed, error and unsuccessful process output', () => {
    for (const [output, code] of [['', 0], ['null\n{}\nnot-json', 0], [text('partial'), 1], [JSON.stringify({ type: 'error', error: { message: 'secret-token' } }), 0]] as const)
      expect(parseTranslationOutput(output, code)).toMatchObject({ ok: false, code: 'failed' })
  })

  it('preserves the built-in agent, limits reads to a temporary workspace and removes it after completion', async() => {
    let workspace = ''
    const result = await translateWithOpenCode('selected-cli.exe', request, new AbortController().signal, async(command, options) => {
      expect(command).toBe('selected-cli.exe')
      workspace = options.cwd
      expect(options.prompt).toContain(request.source)
      expect(options.model).toBe(request.model)
      const config = JSON.parse(await readFile(path.join(workspace, 'opencode.json'), 'utf8'))
      expect(config.agents.build.permissions).toEqual([
        { action: '*', resource: '*', effect: 'deny' },
        { action: 'read', resource: `${workspace}/**`, effect: 'allow' }
      ])
      expect(config.agents.build).not.toHaveProperty('system')
      expect(config.agents.build).not.toHaveProperty('steps')
      return { ok: true, text: '模拟译文' }
    })
    expect(result).toEqual({ ok: true, text: '模拟译文' })
    await expect(access(workspace)).rejects.toThrow()
  })

  it('does not launch cancelled or invalid requests and sanitizes runner failures', async() => {
    const runner = vi.fn(async() => { throw new Error('private provider credential') })
    const controller = new AbortController()
    controller.abort()
    expect(await translateWithOpenCode('cli', request, controller.signal, runner)).toMatchObject({ ok: false, code: 'cancelled' })
    expect(await translateWithOpenCode('cli', { ...request, target: 'invalid' }, new AbortController().signal, runner)).toMatchObject({ ok: false, code: 'failed' })
    expect(runner).not.toHaveBeenCalled()
    const result = await translateWithOpenCode('cli', request, new AbortController().signal, runner)
    expect(result).toMatchObject({ ok: false, code: 'failed' })
    expect(JSON.stringify(result)).not.toContain('private provider credential')
  })
})
