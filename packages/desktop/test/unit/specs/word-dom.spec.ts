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
})
