import type { IFileState } from '@shared/types/files'
import { wordCount as getWordCount } from '@muyajs/core/utils/wordCount'
import { getUniqueId, deepClone } from '../util'

// Helper module (NOT a Pinia store): defaults and factories for the editor
// document state objects.

/**
 * Canonical document state shape used by the editor store. Re-exported as a
 * structural alias of `IFileState` from `@shared/types/files` so consumers
 * that historically imported `IDocumentState` keep compiling.
 */
export type IDocumentState = IFileState

// Re-export the cross-process shape for convenience so renderer code can
// continue to import these from `./help`.
export type { IFileState }

const defaultFileStateWithoutId = {
  isSaved: true,
  pathname: '',
  filename: 'Untitled-1',
  markdown: '',
  encoding: {
    encoding: 'utf8',
    isBom: false
  },
  lineEnding: 'lf',
  trimTrailingNewline: 3,
  adjustLineEndingOnSave: false,
  history: {
    stack: [],
    index: -1
  },
  cursor: null,
  wordCount: {
    paragraph: 0,
    word: 0,
    character: 0,
    all: 0
  },
  searchMatches: {
    index: -1,
    matches: [],
    value: ''
  },
  scrollTop: 0,
  muyaIndexCursor: null,
  notifications: []
} satisfies Omit<IFileState, 'id'>

/**
 * Default internal markdown document with editor options. Acts as the
 * template for cloning into per-tab state. Note: `id` is intentionally
 * omitted — every actual file state must allocate a unique id via
 * `getBlankFileState` / `createDocumentState`.
 */
export const defaultFileState: Omit<IFileState, 'id'> = defaultFileStateWithoutId

export const getOptionsFromState = (
  file: IFileState
): {
  encoding: IFileState['encoding']
  lineEnding: IFileState['lineEnding']
  adjustLineEndingOnSave: boolean
  trimTrailingNewline: number
} => {
  const { encoding, lineEnding, adjustLineEndingOnSave, trimTrailingNewline } = file
  return { encoding, lineEnding, adjustLineEndingOnSave, trimTrailingNewline }
}

const documentStateKeys = [
  'pdfFormValues',
  'pdfAnnotations',
  'pdfSourceHash',
  'pdfView',
  'isSaved',
  'pathname',
  'filename',
  'markdown',
  'encoding',
  'lineEnding',
  'trimTrailingNewline',
  'adjustLineEndingOnSave',
  'history',
  'cursor',
  'wordCount',
  'searchMatches',
  'scrollTop',
  'muyaIndexCursor',
  'notifications'
] as const satisfies ReadonlyArray<keyof IFileState>

export const getBlankFileState = (
  tabs: Array<{ pathname: string; filename: string }>,
  defaultEncoding: string = defaultFileStateWithoutId.encoding.encoding,
  lineEnding: string = defaultFileStateWithoutId.lineEnding,
  markdown: string | null = defaultFileStateWithoutId.markdown
): IFileState => {
  const fileState = deepClone(defaultFileStateWithoutId) as Omit<IFileState, 'id'>
  const defaultFilenamePrefix = defaultFileStateWithoutId.filename.split('-')[0]
  const untitleId = Math.max(
    ...tabs.map((f) => {
      if (f.pathname === '') {
        return Number.parseInt(f.filename.split('-')[1], 10) || 0
      } else {
        return 0
      }
    }),
    0
  )

  const id = getUniqueId()

  // We may pass markdown=null as a parameter.
  if (markdown == null) {
    markdown = defaultFileStateWithoutId.markdown
  }

  fileState.encoding.encoding = defaultEncoding
  return Object.assign(fileState, {
    lineEnding,
    adjustLineEndingOnSave: lineEnding.toLowerCase() === 'crlf',
    id,
    filename: `${defaultFilenamePrefix}-${untitleId + 1}`,
    markdown,
    isSaved: markdown.length === 0,
    wordCount: getWordCount(markdown),
    // Empty new tabs may close silently; imported content has no saved copy.
    lastSavedHistoryId: markdown.length === 0 ? 0 : -1
  }) as IFileState
}

/**
 * Creates an internal document from the given document. Accepts loosely
 * typed input (IPC payloads, partial states) and copies through the keys
 * documented by `documentStateKeys`.
 */
export const createDocumentState = (
  markdownDocument: Partial<IFileState> | Record<string, unknown> | null | undefined = {},
  id: string = getUniqueId()
): IFileState => {
  const src = (markdownDocument || {}) as Record<string, unknown>
  const docState = deepClone(defaultFileStateWithoutId) as Omit<IFileState, 'id'>

  for (const key of documentStateKeys) {
    if (src[key] !== undefined) {
      ;(docState as Record<string, unknown>)[key] = src[key]
    }
  }

  return Object.assign(docState, {
    id,
    // Read `src`: `docState.wordCount` defaults to a zeroed object, not a
    // sentinel, so it cannot say whether the caller supplied one.
    wordCount: src.wordCount ?? getWordCount(docState.markdown),
    // Recovered drafts have no saved baseline in the new engine history.
    lastSavedHistoryId: docState.isSaved ? 0 : -1
  }) as IFileState
}

export const getFileStateFromData = (
  data: Partial<IFileState> | Record<string, unknown> | null | undefined
): IFileState => createDocumentState(data)
