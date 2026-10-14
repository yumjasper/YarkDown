import { beforeEach, describe, expect, it, vi } from 'vitest'

const { listeners } = vi.hoisted(() => ({
  listeners: new Map<string, (event: { sender: object }, id: string) => void>()
}))
vi.mock('electron', () => {
  class Menu {
    items: MenuItem[] = []
    append(item: MenuItem): void {
      this.items.push(item)
    }
  }
  class MenuItem {
    label: string
    enabled: boolean
    visible: boolean
    type: string
    submenu?: Menu
    click: (event: object, win: object) => void
    constructor(options: {
      label?: string
      enabled?: boolean
      visible?: boolean
      type?: string
      submenu?: Menu
      click?: (item: MenuItem, win: object, event: object) => void
    }) {
      this.label = options.label ?? ''
      this.enabled = options.enabled ?? true
      this.visible = options.visible ?? true
      this.type = options.type ?? 'normal'
      this.submenu = options.submenu
      this.click = (event, win) => options.click?.(this, win, event)
    }
  }
  return {
    Menu,
    MenuItem,
    ipcMain: {
      on: (channel: string, callback: (event: { sender: object }, id: string) => void) =>
        listeners.set(channel, callback)
    }
  }
})
vi.mock('main_renderer/config', () => ({ isOsx: true }))
vi.mock('main_renderer/i18n', () => ({ t: (key: string) => key }))
vi.mock('main_renderer/contextMenu/editor/spellcheck', () => ({
  default: () => [
    {
      label: 'Suggestion',
      click: (_item: unknown, win: { webContents: { send: (channel: string) => void } }) =>
        win.webContents.send('spelling-action')
    },
    { type: 'separator' },
    {
      label: 'Disabled',
      enabled: false,
      click: () => {
        throw new Error('Disabled action ran')
      }
    }
  ]
}))
const { showEditorContextMenu } = await import('main_renderer/contextMenu/editor')
const windowFixture = () => ({
  isDestroyed: () => false,
  webContents: { send: vi.fn(), showDefinitionForSelection: vi.fn() }
})
const params = (selectionText = '') =>
  ({
    x: 90,
    y: 120,
    isEditable: true,
    selectionText,
    editFlags: { canCut: false, canCopy: true, canPaste: true, canEditRichly: true }
  }) as Parameters<typeof showEditorContextMenu>[2]
const execute = (sender: object, id: string) =>
  listeners.get('mt::editor-context-native-action')?.({ sender }, id)

describe('native actions behind the renderer context menu', () => {
  beforeEach(() => vi.clearAllMocks())
  it('sends serializable menu data and keeps copy independent from cut', () => {
    const win = windowFixture()
    const event = { preventDefault: vi.fn() }
    showEditorContextMenu(win as never, event, params('selection'), false)
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(win.webContents.send).toHaveBeenCalledWith(
      'mt::editor-context-menu',
      expect.objectContaining({ canCopy: true, canCut: false, x: 90, y: 120 })
    )
    const payload = win.webContents.send.mock.calls[0][1]
    expect(JSON.parse(JSON.stringify(payload)).nativeItems[0]).toEqual({
      id: 'native-0',
      label: 'contextMenu.lookUp',
      enabled: true,
      separator: false
    })
  })
  it('routes macOS lookup to the window that requested it', () => {
    const first = windowFixture()
    const second = windowFixture()
    showEditorContextMenu(first as never, {}, params('first'), false)
    showEditorContextMenu(second as never, {}, params('second'), false)
    execute(second.webContents, 'native-0')
    expect(second.webContents.showDefinitionForSelection).toHaveBeenCalledOnce()
    expect(first.webContents.showDefinitionForSelection).not.toHaveBeenCalled()
  })
  it('preserves spelling callbacks and ignores disabled or unknown actions', () => {
    const win = windowFixture()
    showEditorContextMenu(win as never, {}, params(), true)
    win.webContents.send.mockClear()
    execute(win.webContents, 'native-0-2')
    execute(win.webContents, 'unknown')
    expect(win.webContents.send).not.toHaveBeenCalled()
    execute(win.webContents, 'native-0-0')
    expect(win.webContents.send).toHaveBeenCalledWith('spelling-action')
  })
})
