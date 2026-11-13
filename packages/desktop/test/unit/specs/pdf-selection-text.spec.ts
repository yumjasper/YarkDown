import { afterEach, describe, expect, it } from 'vitest'
import { pdfSelectionText } from '../../../src/renderer/src/util/pdfSelectionText'

const originalRect = Object.getOwnPropertyDescriptor(Range.prototype, 'getBoundingClientRect')
const prepare = (html: string) => {
  document.body.innerHTML = `<div id="viewer"><div class="textLayer">${html}</div></div>`
  const container = document.querySelector('#viewer')
  if (!container) throw new Error('Missing viewer fixture')
  const layer = container.querySelector('.textLayer')
  if (!layer) throw new Error('Missing text layer fixture')
  const range = document.createRange()
  range.selectNodeContents(layer)
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', { configurable: true, value: function(this: Range) {
    const parent = this.startContainer.parentElement
    if (!parent) throw new Error('Missing text parent fixture')
    const x = Number(parent.getAttribute('data-x') || 0)
    const y = Number(parent.getAttribute('data-y') || 0)
    const width = Number(parent.getAttribute('data-width') || 0)
    return { left: x, right: x + width, top: y, bottom: y + 10, height: 10, width } as DOMRect
  } })
  return { container, range }
}

afterEach(() => {
  document.body.innerHTML = ''
  if (originalRect) Object.defineProperty(Range.prototype, 'getBoundingClientRect', originalRect)
  else Reflect.deleteProperty(Range.prototype, 'getBoundingClientRect')
})
describe('PDF selection text boundaries', () => {
  it('retains explicit line endings instead of producing ona or succesfulinverse-rendering', () => {
    const { range, container } = prepare('<span>Conditioned on</span><br><span>a set of renderings</span><br><span>succesful</span><br><span>inverse-rendering</span>')
    expect(range.toString()).toBe('Conditioned ona set of renderingssuccesfulinverse-rendering')
    expect(pdfSelectionText(range, container)).toBe('Conditioned on\na set of renderings\nsuccesful\ninverse-rendering')
  })
  it('recovers spatial word gaps but does not add spaces between contiguous word fragments', () => {
    const { range, container } = prepare('<span data-x="0" data-width="10">on</span><span data-x="12" data-width="5">a</span><span data-x="20" data-width="20">build</span><span data-x="40" data-width="10">ing</span>')
    expect(pdfSelectionText(range, container)).toBe('on a building')
  })
  it('detects a visual line ending without a BR and preserves hyphenated technical words', () => {
    const { range, container } = prepare('<span data-x="0" data-width="40">succesful</span><span data-x="0" data-y="15" data-width="55">inverse-rendering</span>')
    expect(pdfSelectionText(range, container)).toBe('succesful\ninverse-rendering')
  })
  it('does not mistake a small baseline variation for a line break', () => {
    const { range, container } = prepare('<span data-x="0" data-width="4">(</span><span data-x="4" data-y="2" data-width="5">a</span><span data-x="9" data-width="4">)</span>')
    expect(pdfSelectionText(range, container)).toBe('(a)')
  })
  it('clips selections to their actual text-node offsets', () => {
    const { range, container } = prepare('<span>before on</span><br><span>a after</span>')
    const nodes = container.querySelectorAll('span')
    const start = nodes[0].firstChild, end = nodes[1].firstChild
    if (!start || !end) throw new Error('Missing text fixture')
    range.setStart(start, 7)
    range.setEnd(end, 1)
    expect(pdfSelectionText(range, container)).toBe('on\na')
  })
  it('does not collect comments or unselected text outside the PDF text layer', () => {
    const { range, container } = prepare('<span>PDF text</span>')
    container.insertAdjacentHTML('beforeend', '<div>comment</div>')
    expect(pdfSelectionText(range, container)).toBe('PDF text')
    expect(pdfSelectionText(undefined, container)).toBe('')
  })
})
