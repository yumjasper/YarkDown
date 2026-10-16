import { describe, expect, it } from 'vitest'
import { PlainTextDocuments } from '../../../src/renderer/src/components/editorWithTabs/plainTextDocuments'

describe('plain text editor groups', () => {
  it('shares text and undo between views while preserving independent cursors', () => {
    const pool = new PlainTextDocuments()
    const left = pool.open('one', 'first\nsecond\nthird'), right = pool.open('one', '')
    left.doc.setCursor({ line: 0, ch: 0 })
    right.doc.setCursor({ line: 2, ch: 1 })
    right.doc.replaceRange('changed ', { line: 1, ch: 0 })
    expect(left.doc.getValue()).toBe('first\nchanged second\nthird')
    expect(left.doc.getCursor()).toMatchObject({ line: 0, ch: 0 })
    expect(right.doc.getCursor()).toMatchObject({ line: 2, ch: 1 })
    left.doc.undo()
    expect(right.doc.getValue()).toBe('first\nsecond\nthird')
    right.doc.redo()
    expect(left.doc.getValue()).toBe('first\nchanged second\nthird')
    expect(left.shared).toBe(right.shared)
    pool.release(left); pool.release(right); pool.clear()
  })

  it('keeps different files separate and preserves a document after closing one group', () => {
    const pool = new PlainTextDocuments()
    const left = pool.open('one', 'left'), right = pool.open('two', 'right')
    right.doc.replaceRange('edited ', { line: 0, ch: 0 })
    expect(left.doc.getValue()).toBe('left')
    pool.release(right)
    const reopened = pool.open('two', 'stale text')
    expect(reopened.doc.getValue()).toBe('edited right')
    pool.release(reopened)
    pool.prune(['one'])
    const fresh = pool.open('two', 'fresh file')
    expect(fresh.doc.getValue()).toBe('fresh file')
    pool.release(left); pool.release(fresh); pool.clear()
  })
})
