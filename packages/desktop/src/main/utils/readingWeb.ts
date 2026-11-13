import type {
  ReadingViewBounds,
  TranslationProvider,
  TranslationRequest
} from '../../shared/types/reading'

export const isTranslationProvider = (value: unknown): value is TranslationProvider =>
  value === 'bing' || value === 'google'
export const isReadingId = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-z0-9-]{1,80}$/i.test(value)
export const isTranslationRequest = (value: unknown): value is TranslationRequest => {
  if (!value || typeof value !== 'object') return false
  const request = value as Partial<TranslationRequest>
  return (
    isTranslationProvider(request.provider) &&
    typeof request.source === 'string' &&
    !!request.source.trim() &&
    request.source.length <= 5000 &&
    (request.sequence === undefined || (typeof request.sequence === 'number' && Number.isSafeInteger(request.sequence) && request.sequence >= 0))
  )
}
export const translationPageUrl = (provider: TranslationProvider, source = ''): string => {
  const url = new URL(
    provider === 'google' ? 'https://translate.google.com/' : 'https://www.bing.com/translator'
  )
  if (provider === 'google') {
    url.searchParams.set('sl', 'auto')
    url.searchParams.set('tl', 'zh-CN')
    url.searchParams.set('op', 'translate')
    if (source) url.searchParams.set('text', source)
  } else {
    url.searchParams.set('from', 'auto')
    url.searchParams.set('to', 'zh-Hans')
    if (source) url.searchParams.set('text', source)
  }
  return url.href
}
export const isReadingNavigation = (
  destination: string,
  provider: TranslationProvider
): boolean => {
  try {
    const url = new URL(destination)
    if (url.protocol !== 'https:' || url.username || url.password) return false
    const hosts =
      provider === 'google'
        ? ['translate.google.com', 'accounts.google.com', 'consent.google.com']
        : [
          'www.bing.com',
          'cn.bing.com',
          'login.live.com',
          'login.microsoftonline.com',
          'account.live.com',
          'account.microsoft.com'
        ]
    return hosts.includes(url.hostname)
  } catch {
    return false
  }
}
export const clampReadingBounds = (
  bounds: ReadingViewBounds | null,
  size: number[],
  zoom: number
): ReadingViewBounds => {
  const hidden = { x: 0, y: 0, width: 0, height: 0 }
  if (
    !bounds ||
    ![bounds.x, bounds.y, bounds.width, bounds.height, zoom, size[0], size[1]].every(
      Number.isFinite
    ) ||
    zoom <= 0
  )
    return hidden
  const x = Math.max(0, Math.min(size[0], Math.round(bounds.x * zoom)))
  const y = Math.max(0, Math.min(size[1], Math.round(bounds.y * zoom)))
  const right = Math.max(x, Math.min(size[0], Math.round((bounds.x + bounds.width) * zoom)))
  const bottom = Math.max(y, Math.min(size[1], Math.round((bounds.y + bounds.height) * zoom)))
  return { x, y, width: right - x, height: bottom - y }
}
// Only the public translation result is read. Account pages, storage and credentials
// are deliberately outside this adapter; sign-in is performed by the user.
export const translationResultScript = (provider: TranslationProvider): string =>
  provider === 'bing'
    ? `(() => { const node = document.querySelector('#tta_output_ta'); return !node ? '' : 'value' in node ? node.value : node.innerText || node.textContent || ''; })()`
    : `(() => Array.from(document.querySelectorAll('span.ryNqvb')).map(node => node.textContent || '').join('\\n'))()`

export const bingTranslationInputScript = (source: string): string =>
  `(() => { const input = document.querySelector('#tta_input_ta'); if (!input) return false; const source = ${JSON.stringify(source)}; const current = 'value' in input ? input.value : input.innerText || input.textContent || ''; if (current.trim() === source.trim()) return true; if (input instanceof HTMLTextAreaElement) Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, source); else if (input.isContentEditable) input.textContent = source; else return false; input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: source })); input.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`
