#!/usr/bin/env node
/**
 * Runs @electron/rebuild with VCToolsVersion pinned to an MSVC toolset that
 * actually ships Spectre-mitigated libraries.
 *
 * native-keymap's binding.gyp requests `SpectreMitigation: Spectre`, but the
 * default toolset MSBuild resolves for `PlatformToolset=v143` is whatever
 * Microsoft.VCToolsVersion.v143.default.props pins, which can be older than the
 * toolset the "Spectre-mitigated libs" component installs into. The rebuild then
 * fails with MSB8040 even though the libraries are installed. Pinning the
 * toolset here keeps `pnpm install`, `pnpm run rebuild-native` and `build:win`
 * working on such machines without exporting anything by hand.
 *
 * Args are forwarded verbatim, so `-f`, `--arch` and friends behave exactly as
 * they do on electron-rebuild itself.
 */

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveSpectreToolset } from './msvc-spectre.mjs'

const REPO_ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const DESKTOP_ROOT = path.join(REPO_ROOT, 'packages', 'desktop')
const REBUILD_CLI = path.join(DESKTOP_ROOT, 'node_modules', '@electron', 'rebuild', 'lib', 'cli.js')

const args = process.argv.slice(2)

/** Arch electron-rebuild will target, so the Spectre probe looks at the same folder. */
function targetArch () {
  for (const flag of ['--arch', '-a']) {
    const index = args.indexOf(flag)
    if (index !== -1 && args[index + 1]) return args[index + 1]
  }
  const inline = args.find((arg) => arg.startsWith('--arch='))
  if (inline) return inline.slice('--arch='.length)
  return process.env.npm_config_arch || process.arch
}

function pinVcToolset () {
  if (process.platform !== 'win32') return

  const arch = targetArch()
  if (process.env.VCToolsVersion) {
    console.log(`[rebuild-native] VCToolsVersion already set to ${process.env.VCToolsVersion}`)
    return
  }

  const toolset = resolveSpectreToolset(arch)
  if (toolset) {
    // Inherited by node-gyp -> MSBuild as a global property.
    process.env.VCToolsVersion = toolset
    console.log(`[rebuild-native] MSVC toolset ${toolset} (Spectre-mitigated ${arch} libs present)`)
    return
  }

  // The VS component name spells the arch family, so arm64 maps to its own one.
  const componentArch = String(arch).toLowerCase() === 'arm64' ? 'ARM64' : 'x64/x86'
  console.warn(
    `[warn] No MSVC Spectre-mitigated libraries found for ${arch}. The native-keymap ` +
      `rebuild will fail with MSB8040. Install "MSVC v143 - VS 2022 C++ ${componentArch} ` +
      'Spectre-mitigated libs (Latest)" from the Visual Studio Installer.'
  )
}

if (!fs.existsSync(REBUILD_CLI)) {
  console.error(`[error] Missing ${REBUILD_CLI}. Run pnpm install first.`)
  process.exit(1)
}

pinVcToolset()

const result = spawnSync(process.execPath, [REBUILD_CLI, ...args], {
  cwd: DESKTOP_ROOT,
  stdio: 'inherit',
  env: process.env
})
process.exit(result.status ?? 1)
