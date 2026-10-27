import type { BrowserWindowConstructorOptions } from 'electron'

export const editorBackdropOptions = (
  platform: string,
  release: string,
  _titleBarStyle: string
): Partial<BrowserWindowConstructorOptions> => {
  const [major, minor, build] = release.split('.').map(Number)
  if (
    platform !== 'win32' ||
    ![major, minor, build].every(Number.isFinite) ||
    major < 10 ||
    (major === 10 && build < 22621)
  )
    return {}
  // Compositing Mica with a large KaTeX document can stall the whole desktop on resize.
  // Keep the window opaque and retain the theme background set by the caller.
  return { backgroundMaterial: 'none', transparent: false }
}
