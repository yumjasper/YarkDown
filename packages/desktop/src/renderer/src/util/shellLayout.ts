export const SIDEBAR_RAIL_WIDTH = 45
export const MIN_SIDEBAR_CONTENT_WIDTH = 220

export const shellHeaderHeights = (titleBarStyle: string, isMac: boolean) => ({
  title: titleBarStyle === 'native' && !isMac ? 0 : isMac ? 28 : 30,
  menu: titleBarStyle === 'custom' && !isMac ? 26 : 0
})
