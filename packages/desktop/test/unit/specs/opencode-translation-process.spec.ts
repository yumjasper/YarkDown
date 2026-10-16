// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { translateWithOpenCode } from '../../../src/main/utils/opencodeTranslation'

vi.mock('node:child_process', () => ({ spawn: vi.fn(), execFile: vi.fn() }))
const request = { source: 'Translate $(this) literally.', target: 'zh-Hans', model: 'opencode/free-model' }

describe('OpenCode translation subprocess', () => {
  type MockChild = ChildProcessWithoutNullStreams & { stdin: PassThrough; stdout: PassThrough; stderr: PassThrough }
  let child: MockChild
  beforeEach(() => {
    vi.clearAllMocks()
    child = Object.assign(new EventEmitter(), {
      stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(),
      kill: vi.fn(() => { queueMicrotask(() => child.emit('close', null)); return true })
    }) as unknown as MockChild
    vi.mocked(spawn).mockImplementation(((_command: string, _args: string[], options: { signal: AbortSignal }) => {
      options.signal.addEventListener('abort', () => queueMicrotask(() => child.emit('close', null)), { once: true })
      return child
    }) as unknown as typeof spawn)
  })
  afterEach(() => { child.stdout.destroy(); child.stderr.destroy(); child.stdin.destroy() })

  it('passes source through stdin with no shell and parses split JSON chunks', async() => {
    const result = translateWithOpenCode('selected-cli.exe', request, new AbortController().signal)
    await vi.waitFor(() => expect(spawn).toHaveBeenCalledOnce())
    const [command, args, options] = vi.mocked(spawn).mock.calls[0]
    expect(command).toBe('selected-cli.exe')
    expect(args).toEqual(['run', '--format', 'json', '--model', request.model, '--agent', 'build'])
    expect(options).toMatchObject({ shell: false, windowsHide: true })
    expect(JSON.stringify(args)).not.toContain(request.source)
    expect(child.stdin.read().toString()).toContain(request.source)
    child.stdout.write('{"type":"text","part":')
    child.stdout.write('{"text":"译文"}}\n')
    child.emit('close', 0)
    expect(await result).toEqual({ ok: true, text: '译文' })
    expect(execFile).not.toHaveBeenCalled()
  })

  it('interrupts only its own session when cancelled and discards pending output', async() => {
    const controller = new AbortController()
    const result = translateWithOpenCode('selected-cli.exe', request, controller.signal)
    await vi.waitFor(() => expect(spawn).toHaveBeenCalledOnce())
    const session = 'ses_ownedRequest123'
    child.stdout.write(JSON.stringify({ sessionID: session, type: 'text', part: { text: 'partial' } }) + '\n')
    controller.abort()
    expect(await result).toMatchObject({ ok: false, code: 'cancelled' })
    expect(execFile).toHaveBeenCalledWith('selected-cli.exe', ['api', 'POST', `/api/session/${session}/interrupt`],
      expect.objectContaining({ shell: false, timeout: 5000 }), expect.any(Function))
  })
})
