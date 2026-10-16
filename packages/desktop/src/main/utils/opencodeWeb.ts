import type { OpenCodeViewBounds } from '@shared/types/opencode'

export const parseOpenCodePairUrl = (output: string): string => {
  const matches = output.match(/https?:\/\/[^\s<>"']+/g) || []
  for (const match of matches) {
    const clean = match.split(String.fromCharCode(27))[0]
    try {
      const url = new URL(clean)
      if (url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) &&
        !url.username && !url.password && /^\/auth\/connect\/[A-Za-z0-9._~-]+\/?$/.test(url.pathname) &&
        !url.search && !url.hash) return url.href
    } catch { continue }
  }
  throw new Error('OpenCode did not return a local pairing link.')
}

export const clampOpenCodeBounds = (
  bounds: OpenCodeViewBounds | null, size: number[], zoom: number
): OpenCodeViewBounds => {
  const hidden = { x: 0, y: 0, width: 0, height: 0 }
  if (!bounds || ![bounds.x, bounds.y, bounds.width, bounds.height, zoom, size[0], size[1]].every(Number.isFinite) || zoom <= 0) return hidden
  const x = Math.max(0, Math.min(size[0], Math.round(bounds.x * zoom)))
  const y = Math.max(0, Math.min(size[1], Math.round(bounds.y * zoom)))
  const right = Math.max(x, Math.min(size[0], Math.round((bounds.x + bounds.width) * zoom)))
  const bottom = Math.max(y, Math.min(size[1], Math.round((bounds.y + bounds.height) * zoom)))
  return { x, y, width: right - x, height: bottom - y }
}

export const isOpenCodeOrigin = (destination: string, origin: string): boolean => {
  try {
    const url = new URL(destination)
    return url.origin === origin && !url.username && !url.password
  } catch { return false }
}
