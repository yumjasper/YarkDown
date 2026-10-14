import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const profiles = {
  quick: [
    ['-C', 'packages/desktop', 'exec', 'vitest', 'run', '--maxWorkers=4'],
    ['-C', 'packages/muya', 'exec', 'vitest', 'run', '--maxWorkers=4']
  ],
  check: [
    ['run', 'test:quick'],
    ['run', 'lint'],
    ['run', 'typecheck'],
    ['-C', 'packages/muya', 'lint'],
    ['-C', 'packages/muya', 'lint:types'],
    ['-C', 'packages/muya', 'test:spec']
  ],
  smoke: [
    ['run', 'build:unpack'],
    [
      '-C',
      'packages/desktop',
      'exec',
      'playwright',
      'test',
      'smoke.spec.ts',
      '--workers=1',
      '--retries=0'
    ]
  ]
}

const profile = process.argv[2] || 'quick'
if (process.argv.length > 3 || !Object.hasOwn(profiles, profile)) {
  console.error('Usage: pnpm test:quick | pnpm test:check | pnpm test:smoke')
  process.exit(2)
}
const pnpmPath = process.env.npm_execpath
if (!pnpmPath || !/pnpm\.(?:c?js|mjs)$/.test(pnpmPath)) {
  console.error('Run this script through pnpm, for example: pnpm test:quick')
  process.exit(2)
}

const started = performance.now()
for (const args of profiles[profile]) {
  console.log(`\n[verify:${profile}] pnpm ${args.join(' ')}`)
  // Invoke pnpm through Node so Windows needs neither a command shell nor .cmd escaping.
  const child = spawn(process.execPath, [pnpmPath, ...args], {
    cwd: root,
    stdio: 'inherit',
    env: process.env
  })
  const code = await new Promise((resolve) => {
    child.once('error', (error) => {
      console.error(error.message)
      resolve(1)
    })
    child.once('exit', (code) => resolve(code ?? 1))
  })
  if (code !== 0) {
    console.error(`[verify:${profile}] Failed: pnpm ${args.join(' ')}`)
    process.exit(code)
  }
}
console.log(`\n[verify:${profile}] Passed in ${((performance.now() - started) / 1000).toFixed(1)}s`)
