#!/usr/bin/env node
/**
 * Release packer for YarkText.
 *
 * Runs the same pipeline as `build:win` (locale minify -> native rebuild ->
 * electron-vite build -> electron-builder) and copies the distributables out
 * of electron-builder's `dist/` staging folder into `Released/`. `dist/` stays
 * the staging area because the GitHub workflows glob `dist/*.exe` when they
 * upload artifacts, so moving the output would silently break CI.
 *
 * Two host quirks are absorbed here rather than documented away:
 *   - Node 22 is mandatory. Node 24+ builds the MSVC native addons through a
 *     thin-LTO toolchain whose flags clang accepts but MSVC rejects, so this
 *     script re-executes itself under a Node 22 binary when the active runtime
 *     is something else.
 *   - electron-builder extracts its bundled 7za into a shared cache folder
 *     that antivirus occasionally locks, which fails the zip/NSIS targets with
 *     EPERM. Staging 7za under `.tools/` and pointing
 *     ELECTRON_BUILDER_7ZIP_PATH at it skips that extraction entirely.
 */

import { spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const DESKTOP_ROOT = path.join(REPO_ROOT, 'packages', 'desktop')
const DIST_DIR = path.join(REPO_ROOT, 'dist')
const RELEASED_DIR = path.join(REPO_ROOT, 'Released')
const TOOLS_DIR = path.join(REPO_ROOT, '.tools')
const REQUIRED_NODE_MAJOR = 22

/** File kinds electron-builder produces that are worth shipping. */
const ARTIFACT_EXTENSIONS = [
  '.exe',
  '.zip',
  '.blockmap',
  '.dmg',
  '.appimage',
  '.deb',
  '.rpm',
  '.snap',
  '.tar.gz',
  '.yml'
]

/** Written for debugging only; never shipped. */
const IGNORED_ARTIFACTS = new Set(['builder-debug.yml'])

const USAGE = [
  'Usage: node scripts/pack.mjs [options]',
  '',
  'Packages YarkText and copies the distributables into ./Released.',
  '',
  'Options:',
  '  -p, --platform <win|mac|linux>  Target platform (default: current host)',
  '  -a, --arch <x64|arm64>          Target architecture (default: x64)',
  '      --with-unpacked             Also copy the unpacked app directory',
  '      --skip-rebuild              Skip the native module rebuild step',
  '      --keep-dist                 Reuse the previous dist/ contents',
  '      --keep-output               Keep the previous Released/ contents',
  '  -h, --help                      Show this message',
  '',
  'Environment:',
  '  YARKTEXT_NODE               Path to a Node 22 executable to build with',
  '  YARKTEXT_NODE_ROOT          Directory containing Node 22 installs',
  '  ELECTRON_BUILDER_7ZIP_PATH  Override the 7za executable electron-builder uses'
].join('\n')

function logStep (title) {
  console.log(`\n=== ${title} ===`)
}

function logWarn (message) {
  console.warn(`[warn] ${message}`)
}

function fail (message) {
  console.error(`[error] ${message}`)
  process.exit(1)
}

function defaultPlatform () {
  if (process.platform === 'win32') return 'win'
  if (process.platform === 'darwin') return 'mac'
  return 'linux'
}

function parseArgs (argv) {
  const opts = {
    platform: defaultPlatform(),
    arch: 'x64',
    withUnpacked: false,
    skipRebuild: false,
    keepDist: false,
    keepOutput: false,
    help: false
  }

  for (let i = 0; i < argv.length; i++) {
    const raw = argv[i]
    const eq = raw.indexOf('=')
    const key = eq === -1 ? raw : raw.slice(0, eq)
    let value = eq === -1 ? null : raw.slice(eq + 1)
    // Only consume the next argv entry when the value was not inlined with `=`.
    const takeValue = () => {
      if (value !== null) return value
      value = argv[++i]
      return value
    }

    switch (key) {
      case '-h':
      case '--help':
        opts.help = true
        break
      case '-p':
      case '--platform':
        opts.platform = String(takeValue() ?? '').toLowerCase()
        break
      case '-a':
      case '--arch':
        opts.arch = String(takeValue() ?? '').toLowerCase()
        break
      case '--with-unpacked':
        opts.withUnpacked = true
        break
      case '--skip-rebuild':
        opts.skipRebuild = true
        break
      case '--keep-dist':
        opts.keepDist = true
        break
      case '--keep-output':
        opts.keepOutput = true
        break
      default:
        throw new Error(`Unknown option: ${raw}`)
    }
  }

  return opts
}

function nodeMajor (execPath) {
  const result = spawnSync(execPath, ['-p', 'process.versions.node'], { encoding: 'utf8' })
  if (result.error || result.status !== 0) return null
  const major = Number.parseInt(String(result.stdout).trim().split('.')[0], 10)
  return Number.isNaN(major) ? null : major
}

/** Node 22 installs to look at, most explicit first. */
function node22Candidates () {
  const candidates = []
  if (process.env.YARKTEXT_NODE) candidates.push(process.env.YARKTEXT_NODE)
  candidates.push(path.join(TOOLS_DIR, 'nodejs', 'node.exe'))

  const roots = [
    process.env.YARKTEXT_NODE_ROOT,
    'D:\\Tools\\nodejs22',
    path.join(os.homedir(), '.yarktext-node22')
  ]

  for (const root of roots) {
    if (!root || !fs.existsSync(root)) continue
    // Support both a bare install directory and a parent holding versioned ones.
    candidates.push(path.join(root, 'node.exe'))
    let entries
    try {
      entries = fs.readdirSync(root, { withFileTypes: true })
    } catch {
      entries = []
    }
    for (const entry of entries) {
      if (entry.isDirectory()) candidates.push(path.join(root, entry.name, 'node.exe'))
    }
  }

  return candidates
}

function resolveNode22 () {
  if (nodeMajor(process.execPath) === REQUIRED_NODE_MAJOR) return process.execPath
  for (const candidate of node22Candidates()) {
    if (!candidate || !fs.existsSync(candidate)) continue
    if (nodeMajor(candidate) === REQUIRED_NODE_MAJOR) return candidate
  }
  return null
}

/** 7za executable, preferring an explicit override over the staged copy. */
function resolve7za () {
  const candidates = [
    process.env.ELECTRON_BUILDER_7ZIP_PATH,
    path.join(TOOLS_DIR, '7zip', 'bin', '7za.exe')
  ]
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate
  }
  return null
}

/**
 * Self-heal the 7za tool from electron-builder's own download cache, which is
 * the only copy guaranteed to exist offline. Returns the staged executable or
 * null when nothing could be recovered.
 */
function stage7zaFromCache () {
  if (process.platform !== 'win32') return null

  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local')
  const archive = path.join(
    localAppData,
    'electron-builder',
    'Cache',
    '7zip@1.0.0',
    '7zip-win-x64.tar.gz'
  )
  if (!fs.existsSync(archive)) return null

  const target = path.join(TOOLS_DIR, '7zip')
  try {
    fs.rmSync(target, { recursive: true, force: true })
    fs.mkdirSync(target, { recursive: true })
    // The archive wraps everything in a top-level `7zip/` folder.
    const result = spawnSync('tar', ['-xzf', archive, '-C', target, '--strip-components=1'], {
      stdio: 'inherit'
    })
    if (result.status !== 0) return null
  } catch {
    return null
  }

  const staged = path.join(target, 'bin', '7za.exe')
  return fs.existsSync(staged) ? staged : null
}

/** Directories holding MSVC Spectre-mitigated libraries, if any are installed. */
function findSpectreLibs () {
  if (process.platform !== 'win32') return []

  const bases = [
    'C:\\Program Files\\Microsoft Visual Studio\\2022',
    'C:\\Program Files (x86)\\Microsoft Visual Studio\\2022'
  ]
  const found = []

  for (const base of bases) {
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
 * MSVC toolset that ships Spectre-mitigated libraries for the target arch.
 *
 * Visual Studio keeps a default toolset per toolset major (`v143` ->
 * Microsoft.VCToolsVersion.v143.default.txt) that may lag behind the one the
 * Spectre component installs into, so MSBuild picks a toolset whose
 * `lib\spectre\<arch>` folder does not exist and fails with MSB8040. Pinning
 * VCToolsVersion to a toolset that does have the folder resolves it without
 * reinstalling anything.
 */
function resolveSpectreToolset (arch) {
  const candidates = findSpectreLibs()
    .filter((entry) => fs.existsSync(path.join(entry.spectre, arch)))
    .map((entry) => entry.version)
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
  return candidates[0] ?? null
}

function requireFile (file, hint) {
  if (!fs.existsSync(file)) fail(`Expected ${file} to exist. ${hint}`)
  return file
}

function runCommand (label, command, args, options = {}) {
  logStep(label)
  console.log(`> ${[command, ...args].join(' ')}`)
  const result = spawnSync(command, args, { stdio: 'inherit', cwd: DESKTOP_ROOT, ...options })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${label} failed (exit code ${result.status})`)
}

function resetDirectory (dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true })
  } catch (err) {
    throw new Error(
      `Cannot clear ${dir} (${err.code}). Close any running YarkText window and retry, ` +
        'or pass --keep-dist / --keep-output to reuse the existing contents.',
      { cause: err }
    )
  }
  fs.mkdirSync(dir, { recursive: true })
}

function collectArtifacts () {
  if (!fs.existsSync(DIST_DIR)) return []
  return fs
    .readdirSync(DIST_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && !IGNORED_ARTIFACTS.has(entry.name))
    .map((entry) => entry.name)
    .filter((name) => ARTIFACT_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext)))
    .sort()
}

function sha256 (file) {
  const hash = crypto.createHash('sha256')
  const fd = fs.openSync(file, 'r')
  try {
    const buffer = Buffer.allocUnsafe(1024 * 1024)
    let bytes = 0
    while ((bytes = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) {
      hash.update(buffer.subarray(0, bytes))
    }
  } finally {
    fs.closeSync(fd)
  }
  return hash.digest('hex')
}

function gitCommit () {
  const result = spawnSync('git', ['rev-parse', '--short', 'HEAD'], {
    cwd: REPO_ROOT,
    encoding: 'utf8'
  })
  return result.status === 0 ? result.stdout.trim() : 'unknown'
}

function resolveToolEntry (file, hint) {
  return requireFile(file, hint)
}

function main () {
  let opts
  try {
    opts = parseArgs(process.argv.slice(2))
  } catch (err) {
    console.error(`${err.message}\n\n${USAGE}`)
    process.exit(2)
  }

  if (opts.help) {
    console.log(USAGE)
    process.exit(0)
  }

  const validPlatforms = ['win', 'mac', 'linux']
  if (!validPlatforms.includes(opts.platform)) {
    fail(`Unsupported platform "${opts.platform}". Expected one of: ${validPlatforms.join(', ')}`)
  }
  const validArchs = ['x64', 'arm64']
  if (!validArchs.includes(opts.arch)) {
    fail(`Unsupported arch "${opts.arch}". Expected one of: ${validArchs.join(', ')}`)
  }

  // Re-exec under Node 22 before touching any build tool: every downstream
  // binary inherits this process's runtime.
  const node22 = resolveNode22()
  if (!node22) {
    fail(
      `Node ${REQUIRED_NODE_MAJOR}.x is required but no matching binary was found.\n` +
        'Set YARKTEXT_NODE to a Node 22 executable, place one at .tools/nodejs/node.exe, ' +
        'or set YARKTEXT_NODE_ROOT to the directory holding your Node 22 installs.'
    )
  }
  if (path.resolve(node22).toLowerCase() !== path.resolve(process.execPath).toLowerCase()) {
    console.log(`[pack] Re-launching under Node 22: ${node22}`)
    const result = spawnSync(node22, [fileURLToPath(import.meta.url), ...process.argv.slice(2)], {
      stdio: 'inherit',
      env: { ...process.env, YARKTEXT_NODE: node22 }
    })
    process.exit(result.status ?? 1)
  }

  process.env.PATH = `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH || ''}`

  console.log('[pack] Node:', process.version)
  console.log('[pack] Platform:', opts.platform, '| Arch:', opts.arch)

  if (!opts.skipRebuild && process.platform === 'win32') {
    const spectreArch = opts.arch === 'arm64' ? 'ARM64' : 'x64'
    const toolset = resolveSpectreToolset(spectreArch)
    if (toolset) {
      // Inherited by node-gyp -> MSBuild; pins the toolset whose lib\spectre
      // folder actually exists.
      process.env.VCToolsVersion = toolset
      console.log(`[pack] MSVC toolset ${toolset} (Spectre-mitigated ${spectreArch} libs present)`)
    } else {
      logWarn(
        `No MSVC Spectre-mitigated libraries found for ${spectreArch}. The native-keymap ` +
          'rebuild will fail with MSB8040. Install "MSVC v143 - VS 2022 C++ x64/x86 ' +
          'Spectre-mitigated libs (Latest)" from the Visual Studio Installer.'
      )
    }
  }

  const tsxCli = resolveToolEntry(
    path.join(REPO_ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs'),
    'Run pnpm install first.'
  )
  const rebuildCli = resolveToolEntry(
    path.join(DESKTOP_ROOT, 'node_modules', '@electron', 'rebuild', 'lib', 'cli.js'),
    'Run pnpm install first.'
  )
  const viteCli = resolveToolEntry(
    path.join(DESKTOP_ROOT, 'node_modules', 'electron-vite', 'bin', 'electron-vite.js'),
    'Run pnpm install first.'
  )
  const builderCli = resolveToolEntry(
    path.join(DESKTOP_ROOT, 'node_modules', 'electron-builder', 'cli.js'),
    'Run pnpm install first.'
  )

  let sevenZip = resolve7za()
  if (!sevenZip) {
    sevenZip = stage7zaFromCache()
    if (sevenZip) console.log(`[pack] Staged 7za from cache: ${sevenZip}`)
  }
  if (!sevenZip) {
    logWarn(
      'No local 7za found; electron-builder will extract its own. If the build fails ' +
        'with EPERM on the 7zip cache, set ELECTRON_BUILDER_7ZIP_PATH manually.'
    )
  } else {
    process.env.ELECTRON_BUILDER_7ZIP_PATH = sevenZip
  }

  const builderEnv = { ...process.env }
  if (sevenZip) builderEnv.ELECTRON_BUILDER_7ZIP_PATH = sevenZip

  try {
    if (!opts.keepDist) {
      logStep('Cleaning dist/')
      resetDirectory(DIST_DIR)
    }

    runCommand(
      'Minifying locales',
      process.execPath,
      [tsxCli, path.join(REPO_ROOT, 'scripts', 'minify-locales.ts')],
      { cwd: REPO_ROOT }
    )

    if (opts.skipRebuild) {
      logStep('Skipping native rebuild (--skip-rebuild)')
    } else {
      runCommand('Rebuilding native modules', process.execPath, [
        rebuildCli,
        '-f',
        '--arch',
        opts.arch
      ])
    }

    runCommand('Building main / preload / renderer', process.execPath, [viteCli, 'build'])

    const platformFlag = `--${opts.platform}`
    const archFlag = `--${opts.arch}`
    runCommand(
      'Packaging with electron-builder',
      process.execPath,
      [builderCli, platformFlag, archFlag, '--publish', 'never'],
      { env: builderEnv }
    )
  } catch (err) {
    fail(err.message)
  }

  logStep('Collecting artifacts')
  if (!opts.keepOutput) resetDirectory(RELEASED_DIR)
  else fs.mkdirSync(RELEASED_DIR, { recursive: true })

  const artifacts = collectArtifacts()
  if (artifacts.length === 0) {
    fail(`electron-builder produced no distributables in ${DIST_DIR}.`)
  }

  const manifest = []
  for (const name of artifacts) {
    const source = path.join(DIST_DIR, name)
    const target = path.join(RELEASED_DIR, name)
    fs.copyFileSync(source, target)
    const digest = sha256(target)
    const size = fs.statSync(target).size
    manifest.push({ name, size, sha256: digest })
    console.log(`[artifact] ${name} ${size} ${digest}`)
  }

  if (opts.withUnpacked) {
    const unpackedSource = path.join(DIST_DIR, 'win-unpacked')
    if (fs.existsSync(unpackedSource)) {
      const unpackedTarget = path.join(RELEASED_DIR, 'win-unpacked')
      fs.cpSync(unpackedSource, unpackedTarget, { recursive: true })
      console.log('[artifact] win-unpacked/ (directory)')
    } else {
      logWarn('--with-unpacked requested but dist/win-unpacked does not exist.')
    }
  }

  fs.writeFileSync(
    path.join(RELEASED_DIR, 'SHA256SUMS.txt'),
    `${manifest.map((item) => `${item.sha256}  ${item.name}`).join('\n')}\n`,
    'utf8'
  )

  const desktopPkg = JSON.parse(fs.readFileSync(path.join(DESKTOP_ROOT, 'package.json'), 'utf8'))
  const buildInfo = {
    product: desktopPkg.name,
    version: desktopPkg.version,
    platform: opts.platform,
    arch: opts.arch,
    node: process.version,
    commit: gitCommit(),
    builtAt: new Date().toISOString(),
    artifacts: manifest
  }
  fs.writeFileSync(
    path.join(RELEASED_DIR, 'build-info.json'),
    `${JSON.stringify(buildInfo, null, 2)}\n`,
    'utf8'
  )

  logStep('Done')
  console.log(`[pack] ${manifest.length} artifact(s) copied to ${RELEASED_DIR}`)
  for (const item of manifest) {
    console.log(`  - ${item.name} (${(item.size / 1024 / 1024).toFixed(1)} MB)`)
  }
}

main()
