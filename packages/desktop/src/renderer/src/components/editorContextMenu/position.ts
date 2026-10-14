interface Point {
  x: number
  y: number
}
interface Size {
  width: number
  height: number
}

export const fitContextMenu = (point: Point, _size: Size, _viewport: Size): Point => ({ ...point })

const fitSubmenu = (point: Point, size: Size, viewport: Size): Point => ({
  x: Math.max(8, Math.min(point.x, viewport.width - size.width - 8)),
  y: Math.max(8, Math.min(point.y, viewport.height - size.height - 8))
})

export const fitContextSubmenu = (
  parent: { left: number; right: number; top: number },
  size: Size,
  viewport: Size
): Point =>
  fitSubmenu(
    {
      x:
        parent.right + size.width + 12 <= viewport.width
          ? parent.right + 4
          : parent.left - size.width - 4,
      y: parent.top
    },
    size,
    viewport
  )
