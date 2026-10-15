export const isPlainTextFile = (filename: string): boolean => /\.(?:txt|text)$/i.test(filename)

export const suggestedDocumentName = (filename: string, markdownTitle: string): string => {
  if (isPlainTextFile(filename)) return filename
  return `${markdownTitle || filename || 'Untitled'}.md`
}

export interface TextSearchOptions {
  isCaseSensitive?: boolean
  isWholeWord?: boolean
  isRegexp?: boolean
}

export interface TextMatch {
  start: number
  end: number
  text: string
  replacement: (value: string) => string
}

export const findTextMatches = (
  text: string,
  query: string,
  options: TextSearchOptions = {}
): TextMatch[] => {
  if (!query) return []
  const pattern = options.isRegexp ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  let regex: RegExp
  try {
    regex = new RegExp(pattern, options.isCaseSensitive ? 'gm' : 'gim')
  } catch {
    return []
  }
  const matches: TextMatch[] = []
  const wordCharacter = /[\p{L}\p{N}_]/u
  for (const match of text.matchAll(regex)) {
    const start = match.index
    const end = start + match[0].length
    // Empty regex matches cannot be replaced safely by the interactive search bar.
    if (!match[0]) continue
    if (
      options.isWholeWord &&
      (wordCharacter.test(text.slice(0, start).at(-1) || '') ||
        wordCharacter.test(text.slice(end).at(0) || ''))
    )
      continue
    matches.push({
      start,
      end,
      text: match[0],
      replacement: (value) =>
        options.isRegexp
          ? value.replace(/\$(\$|&|`|'|\d{1,2}|<[^>]+>)/g, (token, group: string) => {
            if (group === '$') return '$'
            if (group === '&') return match[0]
            if (group === '`') return text.slice(0, start)
            if (group === "'") return text.slice(end)
            if (group.startsWith('<')) return match.groups?.[group.slice(1, -1)] ?? token
            const index = Number(group)
            return index > 0 && index < match.length ? (match[index] ?? '') : token
          })
          : value
    })
  }
  return matches
}
