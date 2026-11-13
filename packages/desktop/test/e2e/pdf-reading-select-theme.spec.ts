import { expect, test } from '@playwright/test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { PDFDocument } from 'pdf-lib'
import type { Page } from 'playwright'
import { clickMenuById, closeApp, expectNoRendererErrors, launchWithDoc } from './helpers'

/**
 * 原生下拉弹层由 Chromium 独立绘制。`select` 过去是透明背景并继承主题文字色，
 * 深色主题下弹层落到默认白底，选项文字因此不可见。这里按真实主题读取计算样式，
 * 用对比度而不是具体色值断言，允许主题微调配色。
 */

const SUBJECT = '.pdf-reading-assistant .subject-bar select'
const PROVIDER = '.pdf-reading-assistant .provider-bar:not(.subject-bar) select'

const SAMPLE = 'The anomalous phenomenon was investigated by researchers.'

const parseColor = (color: string): [number, number, number, number] | null => {
  const rgb = /rgba?\(([^)]+)\)/.exec(color)
  if (rgb) {
    const parts = rgb[1].split(',').map((part) => Number(part.trim()))
    return [parts[0], parts[1], parts[2], parts[3] ?? 1]
  }
  // color-mix() 在计算样式里序列化为 color(srgb r g b / a)，分量为 0-1。
  const srgb = /color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)/.exec(color)
  if (!srgb) return null
  const channels = srgb.slice(1, 4).map((part) => Number(part) * 255)
  return [channels[0], channels[1], channels[2], srgb[4] === undefined ? 1 : Number(srgb[4])]
}

const relativeLuminance = (color: string): number => {
  const parsed = parseColor(color)
  if (!parsed) return -1
  const [r, g, b] = parsed.map((channel) => {
    const value = channel / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return r * 0.2126 + g * 0.7152 + b * 0.0722
}

/** WCAG 对比度；-1 表示颜色无法解析，让断言直接失败而不是静默通过。 */
const contrastRatio = (foreground: string, background: string): number => {
  const first = relativeLuminance(foreground)
  const second = relativeLuminance(background)
  if (first < 0 || second < 0) return -1
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
}

const opacity = (color: string): number => parseColor(color)?.[3] ?? -1

const readSelectSurface = async(page: Page, selector: string) => {
  return await page.evaluate((target) => {
    const select = document.querySelector<HTMLSelectElement>(target)
    if (!select) return null
    const option = select.querySelector('option')
    const style = getComputedStyle(select)
    const optionStyle = option ? getComputedStyle(option) : null
    return {
      color: style.color,
      background: style.backgroundColor,
      colorScheme: style.colorScheme,
      optionColor: optionStyle?.color ?? '',
      optionBackground: optionStyle?.backgroundColor ?? ''
    }
  }, selector)
}

const assertReadable = (label: string, surface: Awaited<ReturnType<typeof readSelectSurface>>) => {
  if (!surface) throw new Error(`${label} not rendered`)
  // 透明背景会透出原生弹层默认底色，必须是不透明的实色。
  expect(surface.background, `${label} background must be opaque`).not.toBe(
    'rgba(0, 0, 0, 0)'
  )
  expect(opacity(surface.background), `${label} background alpha`).toBe(1)
  expect(
    contrastRatio(surface.optionColor, surface.optionBackground),
    `${label} option contrast (${surface.optionColor} on ${surface.optionBackground})`
  ).toBeGreaterThanOrEqual(4.5)
}

test('subject dropdown stays legible and follows light and dark themes', async() => {
  test.setTimeout(90000)
  const directory = await mkdtemp(path.join(os.tmpdir(), 'yarktext-reading-select-'))
  const filename = path.join(directory, 'select.pdf')
  const pdf = await PDFDocument.create()
  pdf.addPage().drawText(SAMPLE, { x: 40, y: 700, size: 12 })
  await writeFile(filename, await pdf.save())
  const { app, page } = await launchWithDoc(filename, {
    suppressErrorDialog: true,
    preferences: { theme: 'light' }
  })
  try {
    await expect(page.locator('.textLayer').first()).toContainText(SAMPLE)
    await page
      .locator('.textLayer span')
      .first()
      .evaluate((element) => {
        const range = document.createRange()
        range.selectNodeContents(element)
        window.getSelection()?.removeAllRanges()
        window.getSelection()?.addRange(range)
      })
    await page
      .getByRole('toolbar', { name: '选区批注菜单' })
      .getByRole('button', { name: '翻译', exact: true })
      .click()
    const select = page.locator('.pdf-reading-assistant .subject-bar select')
    await expect(select).toBeVisible()

    const light = await readSelectSurface(page, SUBJECT)
    assertReadable('light subject select', light)
    if (!light) throw new Error('subject select not rendered')
    await page.screenshot({ path: '../../.tools/reading-select-light.png' })

    await clickMenuById(app, 'dark')
    await expect(page.locator('body')).toHaveClass(/(^|\s)dark(\s|$)/)
    await expect
      .poll(async() => (await readSelectSurface(page, SUBJECT))?.background, { timeout: 10000 })
      .not.toBe(light.background)

    const dark = await readSelectSurface(page, SUBJECT)
    assertReadable('dark subject select', dark)
    // 原生弹层跟随系统配色，深色主题下必须是 dark，否则弹层仍是白底。
    expect(dark?.colorScheme).toBe('dark')
    expect(relativeLuminance(dark?.background ?? '')).toBeLessThan(0.2)
    expect(relativeLuminance(dark?.color ?? '')).toBeGreaterThan(0.5)

    await page.getByRole('button', { name: '整句翻译在线', exact: true }).click()
    await expect(page.locator(PROVIDER)).toBeVisible()
    const provider = await readSelectSurface(page, PROVIDER)
    assertReadable('dark provider select', provider)
    expect(provider?.colorScheme).toBe('dark')
    expect(relativeLuminance(provider?.background ?? '')).toBeLessThan(0.2)
    await page.screenshot({ path: '../../.tools/reading-select-dark.png' })
    await expectNoRendererErrors(app)
  } finally {
    await closeApp(app)
    await rm(directory, { recursive: true, force: true })
  }
})
