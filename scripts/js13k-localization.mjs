import ts from 'typescript'

const zh = {
  'CLICK TO START': '点击开始游戏',
  'MOUSE SPEED: ': '鼠标灵敏度：',
  ' INVERT: ': ' 反转视角：',
  FULLSCREEN: '全屏',
  'code: ': '程序：',
  ' / music: ': ' ／ 音乐：',
  'YOU NEED THE KEY...': '需要钥匙才能打开……',
  'YOU GOT THE KEY!': '获得了钥匙！',
  'YOU DIED': '你倒下了',
  'THE END': '任务完成',
  'THANKS FOR PLAYING ❤': '感谢游玩 ❤'
}

export function translateGameText (text) {
  if (Object.hasOwn(zh, text)) return zh[text]
  for (const [from, to] of Object.entries(zh).sort((a, b) => b[0].length - a[0].length)) {
    if (from.length >= 5) text = text.replaceAll(from, to)
  }
  return text
}

export function localizeSource (source, filename = 'game.js') {
  const ast = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true)
  const edits = []
  function visit (node) {
    const literal = ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
    const template = ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)
    if (literal || template) {
      const value = node.text
      const translated = translateGameText(value)
      if (translated !== value) {
        const content = template
          ? (ts.isTemplateHead(node) ? '`' : '}') +
            translated.replaceAll('\\', '\\\\').replaceAll('`', '\\`').replaceAll('${', '\\${') +
            (ts.isTemplateTail(node) ? '`' : '${')
          : JSON.stringify(translated)
        edits.push({ start: node.getStart(ast), end: node.end, content })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(ast)
  for (const edit of edits.sort((a, b) => b.start - a.start)) { source = source.slice(0, edit.start) + edit.content + source.slice(edit.end) }
  return source
}
