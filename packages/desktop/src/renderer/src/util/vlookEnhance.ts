/*
 * VLOOK 主题的排版增强层。
 *
 * VLOOK 的「排版增强插件」在 Typora 里是一份 JS + 上千个注入类名，插件本身
 * 深度依赖 Typora 的 `#write` / `.md-fences` / `.typora-*` 结构，直接搬进
 * Muya 会全部落空。这里改为把插件的功能拆成独立的 DOM 增强，用一套固定的
 * `.v-*` 类名契约与主题样式解耦：
 *
 *   - 滚动相关的（阅读进度条、章节高亮）只读写滚动容器，不改文档树；
 *   - 文档相关的（目录面板、脚注跳转、表格十字高亮、提示块）通过
 *     MutationObserver 跟随编辑器重渲染，且只加装饰节点，不改 markdown 内容。
 *
 * 增强只在 VLOOK 主题下启用：主题切换会销毁整套节点，避免残留样式影响其他主题。
 */
import { TOP_LEVEL_HEADINGS_SELECTOR } from './tocNavigation'
import { findActiveHeadingSlug, type HeadingPosition } from './findActiveHeading'

const VLOOK_THEME_PREFIX = 'typora-vlook-'
const ENHANCE_ROOT_ID = 'vlook-enhance-root'
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'
/** Clearance kept between a revealed heading and the viewport top. */
const HEADING_GAP = 24

export interface VlookEnhanceHandle {
  destroy: () => void
}

interface HeadingEntry {
  index: number
  level: number
  text: string
  el: HTMLElement
}

export const isVlookEnhanceTheme = (themeId: string): boolean =>
  themeId.startsWith(VLOOK_THEME_PREFIX)

/**
 * Headings come from the live DOM rather than `editorStore.listToc`: the store
 * trails `json-change` by a debounce, so it still shows the previous heading
 * while the user is typing in the current one.
 */
const collectHeadings = (container: HTMLElement): HeadingEntry[] => {
  const entries: HeadingEntry[] = []
  container.querySelectorAll<HTMLElement>(TOP_LEVEL_HEADINGS_SELECTOR).forEach((el) => {
    // `textContent` also picks up the engine's hover copy-link icon, whose label
    // is empty, so trimming is enough to recover the visible title.
    const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
    if (!text) return
    entries.push({ index: entries.length, level: Number(el.tagName.slice(1)), text, el })
  })
  return entries
}

const buildTocPanel = (
  headings: HeadingEntry[],
  onJump: (el: HTMLElement) => void
): HTMLElement => {
  const panel = document.createElement('nav')
  panel.className = 'v-toc'
  panel.setAttribute('aria-label', 'Chapter navigation')

  for (const heading of headings) {
    const item = document.createElement('a')
    item.className = `v-toc-item v-toc-level-${heading.level}`
    item.textContent = heading.text
    item.title = heading.text
    item.addEventListener('click', (event) => {
      event.preventDefault()
      onJump(heading.el)
    })
    panel.appendChild(item)
  }

  return panel
}

/**
 * 脚注导航：Muya 只给脚注定义块渲染回链，正文引用没有可读编号。
 * 这里在每个定义块前补一个编号徽标，点它回到对应引用处。
 */
const enhanceFootnotes = (container: HTMLElement): void => {
  container.querySelectorAll<HTMLElement>('figure.mu-footnote').forEach((figure, index) => {
    const label = figure.querySelector<HTMLElement>('.mu-footnote-input')
    if (!label || label.dataset.vlookPn === 'true') return
    label.dataset.vlookPn = 'true'
    const badge = document.createElement('span')
    badge.className = 'v-footnote-pn'
    badge.textContent = String(index + 1)
    label.prepend(badge)
  })
}

/** 表格十字高亮：主题里的 `.v-tbl-x` 规则只在鼠标悬停时生效，这里补上基础类。 */
const enhanceTables = (container: HTMLElement): void => {
  container.querySelectorAll<HTMLElement>('.mu-table-inner').forEach((table) => {
    table.classList.add('v-tbl-x')
  })
}

const ALERT_PATTERN = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]$/i

/**
 * 提示块：把 `> [!NOTE]` 的标记行换成大写标签牌。
 * 只加装饰、不改文本节点，因此不会影响 markdown 往返。
 */
const enhanceAlerts = (container: HTMLElement): void => {
  container.querySelectorAll<HTMLElement>('.mu-container blockquote').forEach((quote) => {
    if (quote.dataset.vlookAlert === 'true') return
    const paragraph = quote.querySelector<HTMLElement>(':scope > p')
    if (!paragraph) return
    const match = ALERT_PATTERN.exec((paragraph.textContent ?? '').trim())
    if (!match) return
    const kind = match[1].toLowerCase()
    quote.dataset.vlookAlert = 'true'
    quote.classList.add('v-alert', `v-alert-${kind}`)
    const title = document.createElement('span')
    title.className = 'v-alert-title'
    title.textContent = match[1].toUpperCase()
    paragraph.before(title)
  })
}

/**
 * Mounts the enhancement layer over the editor's scroll container.
 *
 * `scrollContainer` is Muya's `.mu-editor` node (it owns `overflow: auto`), and
 * `.mu-container` inside it is the text column both the TOC and the decorations
 * are scoped to — querying from the scroller instead would also pick up nested
 * headings inside quotes and lists.
 */
export const mountVlookEnhance = (
  themeId: string,
  scrollContainer: HTMLElement
): VlookEnhanceHandle | null => {
  if (!isVlookEnhanceTheme(themeId)) return null
  if (!scrollContainer.querySelector('.mu-container')) return null

  document.getElementById(ENHANCE_ROOT_ID)?.remove()

  // The progress rail lives outside the scroller: inside it, a fixed-width rail
  // would widen the content box and force a horizontal scrollbar.
  const root = document.createElement('div')
  root.id = ENHANCE_ROOT_ID
  const progressBar = document.createElement('div')
  progressBar.className = 'v-progress-bar'
  const progress = document.createElement('div')
  progress.className = 'v-progress'
  progress.appendChild(progressBar)
  root.appendChild(progress)
  document.body.appendChild(root)

  let headings: HeadingEntry[] = []
  let tocPanel: HTMLElement | null = null
  let activeIndex: string | null = null

  const jumpTo = (el: HTMLElement) => {
    const offset =
      scrollContainer.scrollTop +
      el.getBoundingClientRect().top -
      scrollContainer.getBoundingClientRect().top -
      HEADING_GAP
    scrollContainer.scrollTo({ top: Math.max(0, offset), behavior: 'smooth' })
  }

  const syncActiveHeading = () => {
    if (!tocPanel) return
    const positions: HeadingPosition[] = headings.map((heading) => ({
      slug: String(heading.index),
      top: heading.el.getBoundingClientRect().top
    }))
    const viewportTop = scrollContainer.getBoundingClientRect().top + HEADING_GAP
    const next = findActiveHeadingSlug(positions, viewportTop)
    if (next === activeIndex) return
    activeIndex = next
    tocPanel.querySelectorAll<HTMLElement>('.v-toc-item').forEach((item, index) => {
      item.classList.toggle('is-active', String(index) === next)
    })
  }

  const syncProgress = () => {
    const scrollable = scrollContainer.scrollHeight - scrollContainer.clientHeight
    const ratio = scrollable > 0 ? scrollContainer.scrollTop / scrollable : 0
    progressBar.style.height = `${Math.min(100, Math.max(0, ratio * 100))}%`
  }

  const rebuild = () => {
    const container = scrollContainer.querySelector<HTMLElement>('.mu-container')
    if (!container) return

    headings = collectHeadings(container)
    enhanceFootnotes(container)
    enhanceTables(container)
    enhanceAlerts(container)

    const nextPanel = buildTocPanel(headings, jumpTo)
    if (tocPanel?.parentNode) tocPanel.replaceWith(nextPanel)
    else root.appendChild(nextPanel)
    tocPanel = nextPanel
    activeIndex = null
    syncActiveHeading()
  }

  // Scroll fires far more often than the rail can be perceived; one update per
  // frame keeps a long document's scrolling off the critical path.
  let framePending = false
  const onScroll = () => {
    if (framePending) return
    framePending = true
    requestAnimationFrame(() => {
      framePending = false
      syncProgress()
      syncActiveHeading()
    })
  }

  // The engine replaces whole blocks while editing, dropping the decorations
  // stamped on them. `childList` alone is enough: text edits inside an existing
  // block keep their decorations, so they need no rebuild.
  let rebuildTimer: number | undefined
  const observer = new MutationObserver(() => {
    window.clearTimeout(rebuildTimer)
    rebuildTimer = window.setTimeout(rebuild, 120)
  })
  const content = scrollContainer.querySelector<HTMLElement>('.mu-container')
  if (content) observer.observe(content, { childList: true, subtree: true })

  scrollContainer.addEventListener('scroll', onScroll, { passive: true })
  // Reduced motion is a preference, not a behaviour change: keeping the rail's
  // transition off is enough, and browsers without matchMedia simply keep it.
  if (window.matchMedia?.(REDUCED_MOTION_QUERY).matches) {
    progressBar.style.transition = 'none'
  }

  rebuild()
  syncProgress()

  return {
    destroy: () => {
      observer.disconnect()
      window.clearTimeout(rebuildTimer)
      scrollContainer.removeEventListener('scroll', onScroll)
      root.remove()
    }
  }
}
