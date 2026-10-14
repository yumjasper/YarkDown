import { describe, expect, it } from 'vitest'
import { fitContextMenu, fitContextSubmenu } from '@/components/editorContextMenu/position'
import { clipboardHtmlToPlainText } from '@/components/editorContextMenu/plainText'

describe('editor context menu placement', () => {
  const viewport = { width: 800, height: 600 }
  it('keeps a right-click near the bottom-right edge inside the window', () => {
    expect(fitContextMenu({ x: 790, y: 590 }, { width: 220, height: 230 }, viewport)).toEqual({
      x: 572,
      y: 362
    })
  })
  it('flips submenus left when the right side has no space', () => {
    expect(
      fitContextSubmenu({ left: 570, right: 790, top: 580 }, { width: 260, height: 360 }, viewport)
    ).toEqual({ x: 306, y: 232 })
  })
  it('keeps the menu origin visible even in a smaller viewport', () => {
    expect(
      fitContextMenu({ x: -20, y: -10 }, { width: 220, height: 230 }, { width: 180, height: 160 })
    ).toEqual({ x: 8, y: 8 })
  })
})

describe('copy rendered content as plain text', () => {
  it('removes formatting while retaining paragraph and line breaks', () => {
    expect(
      clipboardHtmlToPlainText(
        '<p><strong>Bold</strong> <a href="https://example.com">link</a></p><p>Next<br>line</p>'
      )
    ).toBe('Bold link\n\nNext\nline')
  })
  it('retains table cells and image alternate text without executable content', () => {
    expect(
      clipboardHtmlToPlainText(
        '<style>hidden</style><script>hidden</script><table><tr><td>A</td><td>B</td></tr></table><img alt="Diagram">'
      )
    ).toBe('A\tB\nDiagram')
  })
})
