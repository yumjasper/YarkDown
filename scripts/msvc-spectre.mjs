/**
 * Picks the MSVC toolset that actually ships Spectre-mitigated libraries.
 *
 * Visual Studio keeps one default toolset per toolset major (`v143` ->
 * `Microsoft.VCToolsVersion.v143.default.props`), and that pinned value can lag
 * behind the toolset the "Spectre-mitigated libs" component installs into.
 * MSBuild then resolves `lib\spectre\<arch>` under a version that owns no such
 * folder and fails the native-keymap rebuild with MSB8040. Pinning
 * VCToolsVersion to a toolset that does have the folder fixes the build without
 * touching the machine-wide default or reinstalling the component.
 */

import fs from 'node:fs'
import path from 'node:path'

const VS_BASES = [
  'C:\\Program Files\\Microsoft Visual Studio\\2022',
  'C:\\Program Files (x86)\\Microsoft Visual Studio\\2022'
]

/** Every `lib\spectre` directory found across the installed VS 2022 instances. */
export function findSpectreLibs () {
  if (process.platform !== 'win32') return []

  const found = []
  for (const base of VS_BASES) {
    if (!fs.existsSync(base)) continue
    for (const edition of fs.readdirSync(base)) {
      const toolsRoot = path.join(base, edition, 'VC', 'Tools', 'MSVC')
      if (!fs.existsSync(toolsRoot)) continue
      for (const version of fs.readdirSync(toolsRoot)) {
        const spectre = path.join(toolsRoot, version, 'lib', 'spectre')
        if (fs.existsSync(spectre)) found.push({ version, spectre })
      }
    }
  }
  return found
}

/**
 * Arch subfolder of a `lib\spectre` directory, matched case-insensitively
 * because MSVC spells the same folder `x64` but `ARM64`.
 */
function spectreArchDir (spectreRoot, arch) {
  let entries
  try {
    entries = fs.readdirSync(spectreRoot, { withFileTypes: true })
  } catch {
    return null
  }
  const wanted = String(arch).toLowerCase()
  const match = entries.find((entry) => entry.isDirectory() && entry.name.toLowerCase() === wanted)
  return match ? path.join(spectreRoot, match.name) : null
}

/**
 * Newest MSVC toolset version whose `lib\spectre` covers `arch`, or null when
 * no installed toolset provides it.
 */
export function resolveSpectreToolset (arch) {
  const candidates = findSpectreLibs()
    .filter((entry) => spectreArchDir(entry.spectre, arch) !== null)
    .map((entry) => entry.version)
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
  return candidates[0] ?? null
}
