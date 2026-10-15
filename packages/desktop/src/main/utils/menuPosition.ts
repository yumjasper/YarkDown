import type { MenuPopupPosition } from '@shared/types/menu'

// Renderer coordinates are CSS pixels; native popups use device-independent pixels.
export const nativeMenuPosition = (position: MenuPopupPosition | undefined, zoom: number): Partial<MenuPopupPosition> => {
  if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) return {}
  return { x: Math.round(position.x * zoom), y: Math.round(position.y * zoom) }
}
