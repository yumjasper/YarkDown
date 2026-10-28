import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import {
  clickMenuById,
  closeApp,
  expectNoRendererErrors,
  launchWithDoc
} from './helpers'

/**
 * 主题 × 只读格式的渲染冒烟测试。
 *
 * PDF 走 canvas 自绘、TXT 走 CodeMirror，两者在结构上都与 Muya 的编辑器主题
 * 体系无关，但主题切换会整体替换 `<style id="ag-theme">` 的内容并切换
 * `body.dark`，任何一条覆盖到 `.pdf-reader` 或 `.plain-text-editor` 的全局
 * 规则都可能把它们带崩。这里对全部 33 套主题逐一验证：容器仍然可见、
 * 有非零尺寸、关键子节点仍在、没有渲染进程异常。
 */

const THEMES = [
  'dark',
  'typora-arkfield',
  'typora-ayu-light',
  'typora-catppuccin',
  'typora-cobalt',
  'typora-dracula',
  'typora-drake',
  'typora-drake-dark',
  'typora-github',
  'typora-github-dark',
  'typora-gruvbox',
  'typora-ia-light',
  'typora-inkwell-blue',
  'typora-lapis',
  'typora-lucid-dark',
  'typora-lucid-light',
  'typora-newsprint',
  'typora-nord',
  'typora-notion',
  'typora-notion-dark',
  'typora-one-dark',
  'typora-one-light',
  'typora-orange-heart',
  'typora-pixyll',
  'typora-rose-pine',
  'typora-solarized-light',
  'typora-tokyo-night',
  'typora-typo',
  'typora-vlook-joint',
  'typora-vlook-note',
  'typora-vlook-owl',
  'typora-vue',
  'typora-whitey'
] as const

const readThemeStylesheet = async(page: Page): Promise<string> =>
  await page.evaluate(() => document.getElementById('ag-theme')?.textContent ?? '')

/** 切换主题并等待注入的样式表真正落实到该主题。 */
const applyTheme = async(app: ElectronApplication, page: Page, theme: string): Promise<void> => {
  const before = await readThemeStylesheet(page)
  await clickMenuById(app, theme)
  // 多套主题共享 body.dark 状态，只看 class 会立刻返回并读到上一套的样式。
  await expect.poll(() => readThemeStylesheet(page), { timeout: 15000 }).not.toBe(before)
}

test.describe('theme x read-only formats', () => {
  test.slow()

  test('PDF renders in every theme without renderer errors', async() => {
    test.setTimeout(240000)
    const directory = mkdtempSync(path.join(tmpdir(), 'yarktext-theme-pdf-'))
    const filename = path.join(directory, 'theme-probe.pdf')
    const doc = await PDFDocument.create()
    const font = await doc.embedFont(StandardFonts.Helvetica)
    // 两页：只有多页才能暴露按页渲染 / 虚拟化在主题切换后的失效。
    for (let index = 0; index < 2; index++) {
      const pdfPage = doc.addPage([420, 595])
      pdfPage.drawText(`Theme probe page ${index + 1}`, { x: 48, y: 540, size: 18, font, color: rgb(0.1, 0.1, 0.1) })
      pdfPage.drawRectangle({ x: 48, y: 400, width: 324, height: 80, borderWidth: 1, borderColor: rgb(0.6, 0.6, 0.6) })
    }
    writeFileSync(filename, await doc.save())

    const { app, page } = await launchWithDoc(filename, { suppressErrorDialog: true })
    try {
      await expect(page.locator('.pdf-reader')).toBeVisible()
      await expect(page.locator('.pdf-reader .textLayer').first()).not.toBeEmpty({ timeout: 30000 })

      for (const theme of THEMES) {
        await applyTheme(app, page, theme)

        const snapshot = await page.evaluate(() => {
          const reader = document.querySelector('.pdf-reader') as HTMLElement | null
          if (!reader) return null
          const rect = reader.getBoundingClientRect()
          const style = getComputedStyle(reader)
          const pages = reader.querySelectorAll('.pdfViewer .page')
          const firstCanvas = reader.querySelector('canvas') as HTMLCanvasElement | null
          return {
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            display: style.display,
            visibility: style.visibility,
            opacity: Number(style.opacity),
            pageCount: pages.length,
            canvasWidth: firstCanvas?.width ?? 0,
            canvasHeight: firstCanvas?.height ?? 0,
            bodyDark: document.body.classList.contains('dark')
          }
        })

        expect(snapshot, `${theme}: .pdf-reader 已从 DOM 中消失`).not.toBeNull()
        expect(snapshot!.display, `${theme}: .pdf-reader display 被改为 ${snapshot!.display}`).not.toBe('none')
        expect(snapshot!.visibility, `${theme}: .pdf-reader 不可见`).toBe('visible')
        expect(snapshot!.opacity, `${theme}: .pdf-reader 被整块透明`).toBe(1)
        expect(snapshot!.width, `${theme}: .pdf-reader 宽度塌陷`).toBeGreaterThan(200)
        expect(snapshot!.height, `${theme}: .pdf-reader 高度塌陷`).toBeGreaterThan(200)
        expect(snapshot!.pageCount, `${theme}: PDF 页容器丢失`).toBeGreaterThan(0)
        expect(snapshot!.canvasWidth, `${theme}: PDF canvas 未绘制`).toBeGreaterThan(0)
        expect(snapshot!.canvasHeight, `${theme}: PDF canvas 未绘制`).toBeGreaterThan(0)

        // 主题切换不该把只读文档标脏。
        await expect(page.locator('.tabs-container li.active'), `${theme}: 切换主题后 PDF 标签变为未保存`).not.toHaveClass(/unsaved/)
      }

      // 回到默认浅色主题后，PDF 仍应正常显示。
      await applyTheme(app, page, 'light')
      await expect(page.locator('.pdf-reader')).toBeVisible()
      await expect(page.locator('.pdf-reader .textLayer').first()).not.toBeEmpty()
      await expectNoRendererErrors(app)
    } finally {
      await closeApp(app)
      rmSync(directory, { recursive: true, force: true })
    }
  })

  test('TXT renders in every theme without renderer errors', async() => {
    test.setTimeout(240000)
    const directory = mkdtempSync(path.join(tmpdir(), 'yarktext-theme-txt-'))
    const filename = path.join(directory, 'theme-probe.txt')
    // 混合 CJK / 制表符 / 长行：覆盖等宽度量、换行与行号在主题切换后的稳定性。
    const body = [
      '# 标题不会被解析为 Markdown',
      '* 也不会变成列表',
      '\t制表符与  连续空格',
      'a'.repeat(180),
      '最后一行'
    ].join('\r\n')
    writeFileSync(filename, body, 'utf8')

    const { app, page } = await launchWithDoc(filename, { suppressErrorDialog: true })
    try {
      await expect(page.locator('.plain-text-editor')).toBeVisible()
      await expect(page.locator('.plain-text-editor .CodeMirror')).toBeVisible()

      for (const theme of THEMES) {
        await applyTheme(app, page, theme)

        const snapshot = await page.evaluate(() => {
          const root = document.querySelector('.plain-text-editor') as HTMLElement | null
          const cm = document.querySelector('.plain-text-editor .CodeMirror') as HTMLElement | null
          if (!root || !cm) return null
          const rect = root.getBoundingClientRect()
          const style = getComputedStyle(root)
          const lines = cm.querySelector('.CodeMirror-code')
          const gutter = cm.querySelector('.CodeMirror-gutters') as HTMLElement | null
          const editor = (cm as HTMLElement & { CodeMirror?: { lineCount(): number; getValue(): string } }).CodeMirror
          return {
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            display: style.display,
            visibility: style.visibility,
            opacity: Number(style.opacity),
            lineCount: editor?.lineCount() ?? 0,
            valueLength: editor?.getValue().length ?? 0,
            hasCode: !!lines,
            // 工具栏/状态栏用彩色文本，主题若把 --themeColor 等变量漏掉会退化成透明。
            statusText: (document.querySelector('.plain-text-status') as HTMLElement | null)?.textContent?.trim() ?? '',
            statusOpacity: (document.querySelector('.plain-text-status') as HTMLElement | null)
              ? Number(getComputedStyle(document.querySelector('.plain-text-status') as HTMLElement).opacity)
              : -1,
            gutterVisible: gutter ? gutter.getBoundingClientRect().width >= 0 : false
          }
        })

        expect(snapshot, `${theme}: .plain-text-editor 结构缺失`).not.toBeNull()
        expect(snapshot!.display, `${theme}: .plain-text-editor display 被改为 ${snapshot!.display}`).not.toBe('none')
        expect(snapshot!.visibility, `${theme}: 纯文本编辑器不可见`).toBe('visible')
        expect(snapshot!.opacity, `${theme}: 纯文本编辑器被整块透明`).toBe(1)
        expect(snapshot!.width, `${theme}: 纯文本编辑器宽度塌陷`).toBeGreaterThan(200)
        expect(snapshot!.height, `${theme}: 纯文本编辑器高度塌陷`).toBeGreaterThan(100)
        expect(snapshot!.hasCode, `${theme}: CodeMirror 内容被清空`).toBe(true)
        // 内容必须原样保留：CRLF 统一为 LF 后是 5 行。
        expect(snapshot!.lineCount, `${theme}: 行数被改变`).toBe(5)
        expect(snapshot!.valueLength, `${theme}: 文本内容被截断`).toBeGreaterThan(180)
        expect(snapshot!.statusText, `${theme}: 状态栏文本丢失`).not.toBe('')
        if (snapshot!.statusOpacity !== -1)
          expect(snapshot!.statusOpacity, `${theme}: 状态栏被透明化`).toBeGreaterThan(0)
        expect(snapshot!.gutterVisible, `${theme}: 行号槽宽度异常`).toBe(true)

        await expect(page.locator('.tabs-container li.active'), `${theme}: 切换主题后 TXT 标签变为未保存`).not.toHaveClass(/unsaved/)
      }

      await applyTheme(app, page, 'light')
      await expect(page.locator('.plain-text-editor .CodeMirror')).toBeVisible()
      await expectNoRendererErrors(app)
    } finally {
      await closeApp(app)
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
