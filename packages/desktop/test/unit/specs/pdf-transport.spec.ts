import { expect, it, vi } from 'vitest'
vi.mock('pdfjs-dist', () => ({
  PDFDataRangeTransport: class {
    constructor(_length: number, _data: null) {}
    onDataRange(_begin: number, _data: Uint8Array) {}
    requestDataRange(_begin: number, _end: number) {}
    abort() {}
  }
}))
import { LocalPdfTransport } from '../../../src/renderer/src/services/pdfTransport'

it('splits large PDF.js image ranges into bounded IPC reads and delivers one complete range', async() => {
  const length = 17 * 1024 * 1024
  const read = vi.fn(async(begin: number, end: number) =>
    new Uint8Array(end - begin).fill(begin ? 2 : 1)
  )
  const failed = vi.fn()
  const transport = new LocalPdfTransport({
    length,
    read,
    failed,
    active: () => true,
    progress: vi.fn()
  })
  const deliver = vi.spyOn(transport, 'onDataRange')
  transport.requestDataRange(0, length)
  await vi.waitFor(() => expect(deliver).toHaveBeenCalledTimes(1))
  expect(read.mock.calls).toEqual([
    [0, 8 * 1024 * 1024],
    [8 * 1024 * 1024, 16 * 1024 * 1024],
    [16 * 1024 * 1024, length]
  ])
  const bytes = deliver.mock.calls[0][1]
  if (!bytes) throw new Error('Missing delivered PDF data')
  expect(bytes.length).toBe(length)
  expect(bytes[0]).toBe(1)
  expect(bytes[8 * 1024 * 1024]).toBe(2)
  expect(failed).not.toHaveBeenCalled()
})

it('ignores only late data for a cancelled PDF.js range reader, and delivers later ranges', async() => {
  const failed = vi.fn(),
    progress = vi.fn()
  const transport = new LocalPdfTransport({
    length: 100,
    read: async(begin, end) => new Uint8Array(end - begin),
    active: () => true,
    failed,
    progress
  })
  const deliver = vi
    .spyOn(transport, 'onDataRange')
    .mockImplementationOnce(() => {
      throw new Error('#onReceiveData - no `PDFDataTransportStreamRangeReader` instance found.')
    })
    .mockImplementation(() => {})
  transport.requestDataRange(0, 10)
  transport.requestDataRange(10, 20)
  await vi.waitFor(() => expect(deliver).toHaveBeenCalledTimes(2))
  expect(failed).not.toHaveBeenCalled()
  expect(progress).toHaveBeenLastCalledWith(20)
  deliver.mockImplementationOnce(() => {
    throw new Error('Unexpected transport failure')
  })
  transport.requestDataRange(20, 30)
  await vi.waitFor(() =>
    expect(failed).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Unexpected transport failure' })
    )
  )
})

it('does not deliver or report failures after the document has been aborted', async() => {
  let finish!: (bytes: Uint8Array) => void
  const failed = vi.fn()
  const transport = new LocalPdfTransport({
    length: 100,
    read: () =>
      new Promise((resolve) => {
        finish = resolve
      }),
    active: () => true,
    failed,
    progress: vi.fn()
  })
  const deliver = vi.spyOn(transport, 'onDataRange')
  transport.requestDataRange(0, 10)
  transport.abort()
  finish(new Uint8Array(10))
  await Promise.resolve()
  expect(deliver).not.toHaveBeenCalled()
  expect(failed).not.toHaveBeenCalled()
})
