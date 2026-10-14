import { afterEach, describe, expect, it } from 'vitest'
import { serializeWordDocument } from '../../../src/main/utils/wordDom'

afterEach(() => { document.body.innerHTML = '' })

describe('Word semantic structure', () => {
  it('preserves inline formatting inside a single list item and table cell', () => {
    document.body.innerHTML = '<article><ol><li>第一项<strong>重点</strong>与<em>斜体</em><ul><li>子项</li></ul></li><li>第二项</li></ol><table><tr><td>值<strong>粗体</strong></td></tr></table></article>'
    const { blocks } = serializeWordDocument()
    expect(blocks[0].runs?.map(run => run.text).join('')).toBe('第一项重点与斜体')
    expect(blocks[0].runs?.find(run => run.bold)?.text).toBe('重点')
    expect(blocks[1].list?.level).toBe(1)
    expect(blocks[2].runs?.[0].text).toBe('第二项')
    expect(blocks[3].rows?.[0].cells[0]).toHaveLength(1)
  })
  it('keeps code whitespace and emits figure captions as separate paragraphs', () => {
    document.body.innerHTML = '<article><pre><code>if (x) {\n    return 2;\n}\n</code></pre><p><img src="data:image/png;base64,AA==" width="600" height="200" title="图注"></p></article>'
    const { blocks } = serializeWordDocument()
    expect(blocks[0].text).toBe('if (x) {\n    return 2;\n}')
    expect(blocks[1].style).toBe('figure')
    expect(blocks[2].style).toBe('caption')
  })
  it('keeps a standalone inline formula distinct from a display equation', () => {
    document.body.innerHTML = '<article><p><img data-word-math src="data:image/png;base64,AA=="></p><p data-word-equation><img data-word-math src="data:image/png;base64,AA=="></p></article>'
    const { blocks } = serializeWordDocument()
    expect(blocks[0].style).toBeUndefined()
    expect(blocks[0].alignment).toBeUndefined()
    expect(blocks[1].style).toBe('equation')
    expect(blocks[1].alignment).toBe('center')
  })
  it('numbers only the first paragraph of each list item and preserves cell alignment', () => {
    document.body.innerHTML = '<article><ol start="3"><li><p>第一项</p><p>继续说明</p></li><li><p>第二项</p></li></ol><table><thead><tr><th style="text-align:center">表头</th></tr></thead><tbody><tr><td data-align="right">内容</td></tr></tbody></table></article>'
    const { blocks } = serializeWordDocument()
    expect(blocks[0].list).toMatchObject({ start: 3, continuation: false })
    expect(blocks[1].list).toMatchObject({ continuation: true })
    expect(blocks[2].list).toMatchObject({ continuation: false })
    expect(blocks[3].rows?.[0].cells[0][0]).toMatchObject({ alignment: 'center', runs: [{ text: '表头', bold: true }] })
    expect(blocks[3].rows?.[1].cells[0][0].alignment).toBe('right')
  })
})
