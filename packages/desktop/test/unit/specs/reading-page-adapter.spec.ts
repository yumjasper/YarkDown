import { afterEach, describe, expect, it } from 'vitest'
import {
  cleanupTranslationScript,
  prepareTranslationScript,
  translationSnapshotScript
} from '../../../src/main/utils/readingPageAdapter'

const id = 'adapter-test'
const snapshot = () => window.eval(translationSnapshotScript('bing', id))
const flush = async() => {
  await Promise.resolve()
}
const element = <T extends Element>(selector: string): T => {
  const node = document.querySelector<T>(selector)
  if (!node) throw new Error(`Missing fixture element: ${selector}`)
  return node
}
afterEach(() => {
  window.eval(cleanupTranslationScript(id))
  document.body.replaceChildren()
})
describe('official translation output freshness', () => {
  const prepare = () => {
    document.body.innerHTML =
      '<textarea id="tta_input_ta">previous</textarea><div id="tta_output_ta">上一句译文</div><div id="unrelated"></div>'
    expect(window.eval(prepareTranslationScript('bing', id, false))).toBe(true)
  }
  it('ignores input and unrelated DOM changes', async() => {
    prepare()
    element<HTMLTextAreaElement>('textarea').value = 'new'
    element('#unrelated').textContent = 'changed'
    await flush()
    expect(snapshot()).toMatchObject({ input: 'new', output: '上一句译文', changed: false })
  })
  it('does not treat the previous result with a loading suffix as fresh', async() => {
    prepare()
    element('#tta_output_ta').textContent = '上一句译文 ...'
    await flush()
    expect(snapshot().changed).toBe(false)
    element('#tta_output_ta').textContent = '量子纠缠是一种物理现象。'
    await flush()
    expect(snapshot()).toMatchObject({ output: '量子纠缠是一种物理现象。', changed: true })
  })
  it('accepts replacement output nodes and resets followed by identical translations', async() => {
    prepare()
    element('#tta_output_ta').remove()
    await flush()
    const next = document.createElement('div')
    next.id = 'tta_output_ta'
    next.textContent = '上一句译文'
    document.body.append(next)
    await flush()
    expect(snapshot().changed).toBe(true)
  })
  it('reuses an existing official result only when the initial source matches the request', () => {
    prepare()
    window.eval(cleanupTranslationScript(id))
    window.eval(prepareTranslationScript('bing', id, false, 'previous'))
    expect(snapshot().changed).toBe(true)
    window.eval(cleanupTranslationScript(id))
    window.eval(prepareTranslationScript('bing', id, false, 'new'))
    expect(snapshot().changed).toBe(false)
  })
  it('detects textarea value updates even without any DOM mutation', () => {
    document.body.innerHTML = '<textarea id="tta_input_ta">previous</textarea><textarea id="tta_output_ta">上一句译文</textarea>'
    window.eval(prepareTranslationScript('bing', id, false, 'new'))
    element<HTMLTextAreaElement>('#tta_input_ta').value = 'new'
    element<HTMLTextAreaElement>('#tta_output_ta').value = '新句译文'
    expect(snapshot()).toMatchObject({ input: 'new', output: '新句译文', changed: true })
  })
  it('marks the public output busy state without inspecting unrelated page elements', () => {
    prepare()
    element('#tta_output_ta').setAttribute('aria-busy', 'true')
    expect(snapshot().complete).toBe(false)
    element('#tta_output_ta').removeAttribute('aria-busy')
    element('#unrelated').setAttribute('aria-busy', 'true')
    expect(snapshot().complete).toBe(true)
  })
})
