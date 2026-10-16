import { markRaw } from 'vue'
import type CodeMirror from 'codemirror'
import codeMirror from '@/codeMirror/core'
import { SyntheticHistory } from './syntheticHistory'

interface SharedTextDocument {
  doc: CodeMirror.Doc
  history: SyntheticHistory
}
export interface TextDocumentView {
  doc: CodeMirror.Doc
  shared: SharedTextDocument
}

export class PlainTextDocuments {
  private documents = new Map<string, SharedTextDocument>()

  open(id: string, text: string): TextDocumentView {
    let shared = this.documents.get(id)
    if (!shared) {
      shared = { doc: markRaw(new codeMirror.Doc(text, 'text/plain')), history: new SyntheticHistory(text, true) }
      this.documents.set(id, shared)
    }
    // Linked documents share content and undo, while each pane owns its cursor
    // and scroll position. One Doc cannot be attached to two editors directly.
    return { doc: markRaw(shared.doc.linkedDoc({ sharedHist: true })), shared }
  }

  release(view: TextDocumentView): void {
    view.shared.doc.unlinkDoc(view.doc)
  }

  prune(ids: string[]): void {
    for (const id of this.documents.keys()) if (!ids.includes(id)) this.documents.delete(id)
  }

  clear(): void { this.documents.clear() }
}
