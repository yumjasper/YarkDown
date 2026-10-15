export interface MinimapTileRequest {
  id: number
  width: number
  height: number
  ratio: number
  fontSize: number
  renderCharacters: boolean
  maxColumn: number
  normal: string
  accent: string
  rows: Array<{ text: string; y: number; height: number; heading?: boolean }>
}

const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<MinimapTileRequest>) => void) | null
  postMessage: (value: { id: number; bitmap: ImageBitmap }, transfer: Transferable[]) => void
}
scope.onmessage = ({ data }) => {
  const canvas = new OffscreenCanvas(Math.ceil(data.width * data.ratio), Math.ceil(data.height * data.ratio))
  const context = canvas.getContext('2d')
  if (!context) return
  context.scale(data.ratio, data.ratio)
  context.font = `${data.fontSize}px monospace`
  context.textBaseline = 'top'
  for (const row of data.rows) {
    context.fillStyle = row.heading || /^\s*(?:#|\$|const|function|class|\[)/.test(row.text) ? data.accent : data.normal
    context.globalAlpha = row.heading ? .95 : .78
    const y = Math.round(row.y * data.ratio) / data.ratio
    if (data.renderCharacters) context.fillText(row.text, 5, y)
    else for (const match of row.text.matchAll(/\S+/g)) context.fillRect(5 + match.index / data.maxColumn * (data.width - 12), row.y, Math.max(1, match[0].length / data.maxColumn * (data.width - 12)), Math.min(2, Math.max(1, row.height)))
  }
  const bitmap = canvas.transferToImageBitmap()
  scope.postMessage({ id: data.id, bitmap }, [bitmap])
}
