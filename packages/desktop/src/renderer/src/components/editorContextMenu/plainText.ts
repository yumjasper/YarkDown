export const clipboardHtmlToPlainText = (html: string): string => {
  const template = document.createElement('template')
  template.innerHTML = html
  const fragment = template.content
  fragment.querySelectorAll('script,style').forEach((node) => node.remove())
  fragment.querySelectorAll('br').forEach((node) => node.replaceWith('\n'))
  fragment.querySelectorAll('img').forEach((node) => node.replaceWith(node.alt))
  fragment.querySelectorAll('td,th').forEach((node) => node.append('\t'))
  fragment.querySelectorAll('p,h1,h2,h3,h4,h5,h6').forEach((node) => node.append('\n\n'))
  fragment.querySelectorAll('li,pre,tr').forEach((node) => node.append('\n'))
  return (fragment.textContent ?? '')
    .replace(/\t+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd()
}
