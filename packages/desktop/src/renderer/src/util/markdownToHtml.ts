const markdownToHtml = async(markdown: string): Promise<string> => {
  // `MarkdownToHtml#renderHtml` already wraps the output in
  // `<article class="markdown-body">…</article>`, so we return it as-is.
  const { MarkdownToHtml } = await import('@muyajs/core')
  return new MarkdownToHtml(markdown).renderHtml()
}

export default markdownToHtml
