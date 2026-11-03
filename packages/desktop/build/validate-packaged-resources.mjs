import fs from 'node:fs'
import path from 'node:path'

export function validatePackagedResources (resourcesPath) {
  const required = ['static/preference.json', 'static/icon.ico', 'icons/md.ico']
  const locales = ['de', 'en', 'es', 'fr', 'ja', 'ko', 'nl', 'pt', 'ru', 'tr', 'zh-CN', 'zh-TW']
  required.push(...locales.map(locale => `static/locales/${locale}.min.json`))
  for (const relative of required) {
    const file = path.join(resourcesPath, relative)
    if (!fs.existsSync(file) || !fs.statSync(file).isFile() || fs.statSync(file).size === 0) {
      throw new Error(`Packaged resource missing or empty: ${file}`)
    }
    if (relative.endsWith('.json')) {
      const value = JSON.parse(fs.readFileSync(file, 'utf8'))
      if (!value || Array.isArray(value) || typeof value !== 'object' || !Object.keys(value).length) {
        throw new Error(`Packaged resource must contain a non-empty JSON object: ${file}`)
      }
    }
  }
}

// afterPack runs after extraResources has been copied but before distributables are created.
export default function afterPack (context) {
  const resourcesPath = context.electronPlatformName === 'darwin'
    ? path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents', 'Resources')
    : path.join(context.appOutDir, 'resources')
  validatePackagedResources(resourcesPath)
}
