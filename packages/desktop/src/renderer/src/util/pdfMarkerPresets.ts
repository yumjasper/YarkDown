export const MAX_PDF_MARKERS = 6
export const DEFAULT_PDF_MARKERS = ['#fff100', '#78ed53', '#87d9ef', '#f29bd4', '#ed4145']
export interface MarkerPreset { width: number; textOnly: boolean }
const validColor = (value: string) => /^#[a-f\d]{6}$/i.test(value)

export const markerPalette = (stored: unknown, activeColor: string) => {
  const colors = [...DEFAULT_PDF_MARKERS]
  if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
    for (const color of Object.keys(stored)) {
      if (validColor(color) && !colors.includes(color.toLowerCase())) colors.push(color.toLowerCase())
    }
  }
  const result = colors.slice(0, MAX_PDF_MARKERS)
  return updateMarkerPalette(result, activeColor)
}

export const updateMarkerPalette = (palette: string[], color: string) => {
  const result = [...new Set(palette.filter(validColor).map(value => value.toLowerCase()))].slice(0, MAX_PDF_MARKERS)
  if (!validColor(color) || result.includes(color.toLowerCase())) return result
  // Color-input drags replace one custom slot rather than creating a pen for every intermediate color.
  if (result.length === MAX_PDF_MARKERS) result[MAX_PDF_MARKERS - 1] = color.toLowerCase()
  else result.push(color.toLowerCase())
  return result
}

export const boundedMarkerPresets = (palette: string[], stored: unknown): Record<string, MarkerPreset> => {
  const entries = stored && typeof stored === 'object' && !Array.isArray(stored)
    ? stored as Record<string, Partial<MarkerPreset>> : {}
  return Object.fromEntries(palette.slice(0, MAX_PDF_MARKERS).map(color => {
    const entry = entries[color]
    return [color, {
      width: typeof entry?.width === 'number' && Number.isFinite(entry.width) ? Math.max(4, Math.min(30, entry.width)) : 14,
      textOnly: entry?.textOnly !== false
    }]
  }))
}
