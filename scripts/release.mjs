#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = fileURLToPath(new URL('..', import.meta.url))
const args = process.argv.slice(2)
const run = (argv, optional = false) => {
  const result = spawnSync('git', argv, { cwd: root, encoding: 'utf8', windowsHide: true })
  if (result.status !== 0 && !optional) throw new Error(result.stderr?.trim() || result.error?.message || `git ${argv[0]} 失败`)
  return result.status === 0 ? result.stdout.trim() : null
}

try {
  if (args.includes('--help')) {
    console.log('用法：node scripts/release.mjs [--check] [--tag v1.0.8] [--publish]\n默认只检查版本；--publish 创建版本标签并推送到 origin，触发 GitHub Release。')
    process.exit(0)
  }
  let tag
  if (args.includes('--check') && args.includes('--publish')) throw new Error('--check 与 --publish 不能同时使用。')
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--tag') {
      tag = args[++i]
      if (!tag || tag.startsWith('--')) throw new Error('--tag 后必须提供版本标签。')
    } else if (!['--check', '--publish'].includes(args[i])) throw new Error(`未知参数：${args[i]}`)
  }
  const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version
  const desktop = JSON.parse(fs.readFileSync(path.join(root, 'packages/desktop/package.json'), 'utf8')).version
  tag ??= `v${version}`
  if (!/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(tag) || tag !== `v${version}` || version !== desktop) {
    throw new Error(`标签 ${tag} 必须与两个 package.json 的三段数字版本号一致。`)
  }
  console.log(`[通过] 版本 ${version}，标签 ${tag}`)
  if (!args.includes('--publish')) {
    console.log(`发布命令：node scripts/release.mjs --publish --tag ${tag}`)
    process.exit(0)
  }
  if (run(['status', '--porcelain'])) throw new Error('发布前请先提交本地修改并完成合并；Release 必须能从已提交代码重建。')
  const origin = run(['remote', 'get-url', 'origin'])
  if (!/github\.com[:/]yumjasper\/YarkDown(?:\.git)?$/i.test(origin)) throw new Error(`发布仓库不匹配：${origin}`)
  if (run(['ls-remote', '--tags', 'origin', `refs/tags/${tag}`])) throw new Error(`远端标签 ${tag} 已存在，请使用新的版本号。`)
  const existing = run(['rev-parse', '--verify', `refs/tags/${tag}^{commit}`], true)
  if (existing && existing !== run(['rev-parse', 'HEAD'])) throw new Error(`本地标签 ${tag} 不指向当前提交。`)
  if (!existing) run(['tag', '-a', tag, '-m', `YarkText ${version} 正式版本`])
  run(['push', 'origin', `refs/tags/${tag}`])
  console.log('标签已推送，GitHub Actions 将构建并发布下载文件。')
  console.log('构建进度：https://github.com/yumjasper/YarkDown/actions/workflows/release.yml')
  console.log(`下载页面：https://github.com/yumjasper/YarkDown/releases/tag/${tag}`)
} catch (error) {
  console.error(`[失败] ${error.message}`)
  process.exitCode = 1
}
