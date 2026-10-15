import { PDFDataRangeTransport } from 'pdfjs-dist'

interface LocalPdfSource {
  length: number
  read: (begin: number, end: number) => Promise<Uint8Array>
  active: () => boolean
  progress: (loaded: number) => void
  failed: (error: unknown) => void
}

export class LocalPdfTransport extends PDFDataRangeTransport {
  private aborted = false
  private loaded = 0
  private readonly received = new Set<string>()
  constructor(private readonly source: LocalPdfSource) {
    super(source.length, null)
  }

  override requestDataRange(begin: number, end: number): void {
    void this.readRange(begin, end)
      .then((bytes) => {
        if (!bytes) return
        if (this.aborted || !this.source.active()) return
        try {
          this.onDataRange(begin, new Uint8Array(bytes))
        } catch (error) {
          // PDF.js 6 exposes only whole-document aborts. Individual cancelled readers can disappear before an IPC read completes.
          if (
            error instanceof Error &&
            /^#onReceiveData - no .*PDFDataTransportStreamRangeReader.*instance found\.$/.test(
              error.message
            )
          )
            return
          throw error
        }
      })
      .catch((error) => {
        if (!this.aborted && this.source.active()) this.source.failed(error)
      })
  }
  private async readRange(begin: number, end: number): Promise<Uint8Array | undefined> {
    const result = new Uint8Array(end - begin)
    // PDF.js combines ranges for large images; each IPC request must stay within the main-process limit.
    for (let offset = begin; offset < end;) {
      const limit = Math.min(end, offset + 8 * 1024 * 1024)
      const bytes = await this.source.read(offset, limit)
      if (this.aborted || !this.source.active()) return
      if (bytes.byteLength !== limit - offset) throw new Error('Incomplete PDF byte range.')
      result.set(bytes, offset - begin)
      const key = `${offset}:${limit}`
      if (!this.received.has(key)) {
        this.received.add(key)
        this.loaded = Math.min(this.source.length, this.loaded + bytes.byteLength)
        this.source.progress(this.loaded)
      }
      offset = limit
    }
    return result
  }
  override abort(): void {
    this.aborted = true
  }
}
