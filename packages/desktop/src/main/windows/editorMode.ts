import type { WebContents } from 'electron'

const textEditors = new WeakSet<WebContents>()
export const setPlainTextEditor = (contents: WebContents, active: boolean): void => {
  if (active) textEditors.add(contents)
  else textEditors.delete(contents)
}
export const isPlainTextEditor = (contents: WebContents): boolean => textEditors.has(contents)
