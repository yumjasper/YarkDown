import { beforeEach, describe, expect, it, vi } from 'vitest'

const { showRendererConfirm, trashItem, t } = vi.hoisted(() => ({
  showRendererConfirm: vi.fn(),
  trashItem: vi.fn(),
  t: vi.fn((key: string) => key)
}))

vi.mock('electron', () => ({
  BrowserWindow: class {},
  shell: { trashItem }
}))
vi.mock('main_renderer/i18n', () => ({ t }))
vi.mock('main_renderer/utils/rendererConfirm', () => ({ showRendererConfirm }))

import { confirmAndTrashItem } from 'main_renderer/filesystem/trash'

const fakeWindow = {} as never

describe('confirmAndTrashItem', () => {
  beforeEach(() => {
    showRendererConfirm.mockReset()
    trashItem.mockReset()
    trashItem.mockResolvedValue(undefined)
  })

  it('trashes only after the confirm button, and never on cancel', async() => {
    showRendererConfirm.mockResolvedValue('trash')
    await expect(confirmAndTrashItem(fakeWindow, '/docs/notes.md')).resolves.toBe(true)
    expect(trashItem).toHaveBeenCalledWith('/docs/notes.md')

    // Cancel must be the prompt's cancel value so Esc and overlay clicks keep
    // the file, and the confirm button must stay non-primary.
    const [, options] = showRendererConfirm.mock.calls[0] as [
      unknown,
      { cancelValue: string; buttons: Array<{ value: string; primary?: boolean }> }
    ]
    expect(options.cancelValue).toBe('cancel')
    expect(options.buttons.find((b) => b.value === 'trash')?.primary).toBeFalsy()

    showRendererConfirm.mockResolvedValue('cancel')
    await expect(confirmAndTrashItem(fakeWindow, '/docs/notes.md')).resolves.toBe(false)
    expect(trashItem).toHaveBeenCalledTimes(1)
  })

  it('does not trash when no window can show the prompt', async() => {
    showRendererConfirm.mockResolvedValue('cancel')

    await expect(confirmAndTrashItem(null, '/docs/notes.md')).resolves.toBe(false)

    expect(showRendererConfirm).toHaveBeenCalledWith(null, expect.anything())
    expect(trashItem).not.toHaveBeenCalled()
  })
})
