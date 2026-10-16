import type { PdfAnnotation } from '@shared/pdf'

interface Change { id: string; before?: PdfAnnotation; after?: PdfAnnotation }
interface Transaction { changes: Change[]; key?: string; time: number; bytes: number }
const copy = (item: PdfAnnotation | undefined) => item ? structuredClone(item) : undefined
const serialized = (item: unknown) => JSON.stringify(item)

// Stores changed annotations only. The byte budget covers serialized payloads, not VM object overhead.
export class PdfAnnotationHistory {
  private past: Transaction[] = []
  private future: Transaction[] = []
  constructor(private readonly maxEntries = 60, private readonly maxBytes = 8 * 1024 * 1024) {}
  get canUndo() { return this.past.length > 0 }
  get canRedo() { return this.future.length > 0 }
  get size() { return this.past.length }
  clear() { this.past = []; this.future = [] }
  record(before: PdfAnnotation[], after: PdfAnnotation[], key?: string) {
    const old = new Map(before.map(item => [item.id, item]))
    const next = new Map(after.map(item => [item.id, item]))
    const changes = [...new Set([...old.keys(), ...next.keys()])]
      .filter(id => serialized(old.get(id)) !== serialized(next.get(id)))
      .map(id => ({ id, before: JSON.parse(serialized(old.get(id)) || 'null') || undefined, after: JSON.parse(serialized(next.get(id)) || 'null') || undefined } as Change))
    if (!changes.length) return false
    const time = Date.now()
    const previous = this.past.at(-1)
    if (key && previous?.key === key && time - previous.time < 800) {
      const merged = new Map(previous.changes.map(change => [change.id, change]))
      for (const change of changes) {
        const initial = merged.get(change.id)
        merged.set(change.id, { ...change, before: initial ? initial.before : change.before })
      }
      previous.changes = [...merged.values()].filter(change => serialized(change.before) !== serialized(change.after))
      previous.time = time
      previous.bytes = serialized(previous.changes).length * 2
      if (!previous.changes.length) this.past.pop()
    } else this.past.push({ changes, key, time, bytes: serialized(changes).length * 2 })
    this.future = []
    while (this.past.length > this.maxEntries || this.past.reduce((sum, item) => sum + item.bytes, 0) > this.maxBytes) this.past.shift()
    return true
  }
  private apply(items: PdfAnnotation[], transaction: Transaction, direction: 'before' | 'after') {
    const values = new Map(items.map(item => [item.id, item]))
    for (const change of transaction.changes) {
      const value = copy(change[direction])
      if (value) values.set(change.id, value)
      else values.delete(change.id)
    }
    return [...values.values()]
  }
  undo(items: PdfAnnotation[]) {
    const transaction = this.past.pop()
    if (!transaction) return items
    this.future.push(transaction)
    return this.apply(items, transaction, 'before')
  }
  redo(items: PdfAnnotation[]) {
    const transaction = this.future.pop()
    if (!transaction) return items
    this.past.push(transaction)
    return this.apply(items, transaction, 'after')
  }
}
