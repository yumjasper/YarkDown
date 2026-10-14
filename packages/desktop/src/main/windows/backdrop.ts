import type { BrowserWindowConstructorOptions } from 'electron'

export const editorBackdropOptions = (
  platform: string,
  release: string,
  titleBarStyle: string
): Partial<BrowserWindowConstructorOptions> => {
  const [major, minor, build] = release.split('.').map(Number)
  if (
    platform !== 'win32' ||
    ![major, minor, build].every(Number.isFinite) ||
    major < 10 ||
    (major === 10 && build < 22621)
  )
    return {}
  if (titleBarStyle === 'native') return { backgroundMaterial: 'acrylic' }
  // DWM supplies the backdrop; a layered transparent window would lose native resize behavior.
  return { backgroundMaterial: 'acrylic', backgroundColor: '#00000000', transparent: false }
}
