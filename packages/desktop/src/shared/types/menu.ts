// Menu template shapes used across main↔renderer. Mirrors the Electron
// MenuItemConstructorOptions surface narrowly enough for our use without
// pulling Electron types into renderer-only consumers.

export interface MenuTemplateItem {
  id?: string
  label?: string
  type?: 'normal' | 'separator' | 'submenu' | 'checkbox' | 'radio'
  accelerator?: string
  enabled?: boolean
  visible?: boolean
  checked?: boolean
  role?: string
  click?: string
  submenu?: MenuTemplateItem[]
  // Open shape — main-side menu builder occasionally tucks extra metadata in.
  [key: string]: unknown
}

export type MenuTemplate = MenuTemplateItem[]

export interface MenuPopupPosition {
  // Viewport-relative CSS pixels, before the webContents zoom factor is applied.
  x: number
  y: number
}

/**
 * Serialized top-level entry of a window's menu bar. Renderers use this to
 * draw an in-app menu bar; clicks are resolved by index on the main side.
 */
export interface MenuBarItem {
  checked?: boolean
  label: string
  enabled: boolean
  submenu: boolean
}

export interface EditorContextNativeItem {
  id: string
  label: string
  enabled: boolean
  separator?: boolean
  submenu?: EditorContextNativeItem[]
}

export interface EditorContextMenuRequest {
  x: number
  y: number
  selectionText: string
  canCut: boolean
  canCopy: boolean
  canPaste: boolean
  nativeItems: EditorContextNativeItem[]
}
