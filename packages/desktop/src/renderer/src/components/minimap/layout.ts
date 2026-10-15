export type MinimapSize = 'proportional' | 'fit' | 'fill'
export interface MinimapGeometry {
  contentHeight: number
  offset: number
  sliderTop: number
  sliderHeight: number
  scrollRange: number
}
export const minimapLayout = (
  height: number,
  documentHeight: number,
  viewportHeight: number,
  scrollTop: number,
  rows: number,
  scale: number,
  size: MinimapSize
): MinimapGeometry => {
  height = Math.max(1, height)
  documentHeight = Math.max(1, documentHeight)
  const naturalHeight = Math.max(1, rows * 3 * scale)
  const contentHeight = size === 'fill' ? height : size === 'fit' ? Math.min(height, naturalHeight) : naturalHeight
  const scrollRange = Math.max(0, documentHeight - viewportHeight)
  const progress = scrollRange ? Math.max(0, Math.min(1, scrollTop / scrollRange)) : 0
  const offset = Math.max(0, contentHeight - height) * progress
  const sliderHeight = Math.min(height, contentHeight, Math.max(12, contentHeight * Math.min(1, viewportHeight / documentHeight)))
  const sliderTop = Math.min(height - sliderHeight, Math.max(0, contentHeight * (scrollTop / documentHeight) - offset))
  return { contentHeight, offset, sliderTop, sliderHeight, scrollRange }
}

export const minimapScrollTarget = (y: number, geometry: MinimapGeometry, documentHeight: number, viewportHeight: number): number =>
  Math.max(0, Math.min(geometry.scrollRange, (y + geometry.offset) / geometry.contentHeight * documentHeight - viewportHeight / 2))
