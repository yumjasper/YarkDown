import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import ts from 'typescript'
import { installRacer } from './game-adapters/racer.mjs'
import { installTetris } from './game-adapters/tetris.mjs'
import { createGameStorage } from './js13k-bridge.mjs'
import { localizeSource } from './js13k-localization.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const require = createRequire(
  new URL('../packages/desktop/node_modules/vite/package.json', import.meta.url)
)
const { transform } = require('esbuild')
const vendor = path.join(root, 'packages/desktop/vendor/js13k')
const output = path.join(root, 'packages/desktop/src/renderer/public/js13k')
const bridge = `const localStorage = (${createGameStorage.toString()})();`

async function emit (id, code, { markup = '', style = '', bodyAttributes = '' } = {}) {
  const script = bridge + '\n' + code
  if (/<\/script/i.test(script)) throw new Error('Unexpected script terminator')
  const hash = createHash('sha256').update(script).digest('base64')
  const policy = `default-src 'none'; script-src 'sha256-${hash}'; style-src 'unsafe-inline'; img-src data:; media-src data:; base-uri 'none'; form-action 'none'`
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${policy}"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${id}</title><style>html,body{margin:0;overflow:hidden;background:#111}button{cursor:pointer}${style}</style></head><body ${bodyAttributes}>${markup}<script>${script}</script></body></html>`
  await mkdir(path.join(output, id), { recursive: true })
  await writeFile(path.join(output, id, 'index.html'), html)
  await writeFile(
    path.join(output, id, 'LICENSE'),
    await readFile(path.join(vendor, id, 'LICENSE'))
  )
  console.log(`${id}: ${Buffer.byteLength(html)} bytes`)
}

async function classicScripts (id, filename) {
  const html = await readFile(path.join(vendor, id, filename), 'utf8')
  const sources = [...html.matchAll(/<script[^>]*src="([^"]+)"[^>]*><\/script>/g)]
  const code = (
    await Promise.all(sources.map((match) => readFile(path.join(vendor, id, match[1]), 'utf8')))
  ).join('\n;\n')
  return { html, code }
}

async function minify (code) {
  return (
    await transform(code, {
      minifyWhitespace: true,
      minifySyntax: true,
      target: 'es2022',
      legalComments: 'none'
    })
  ).code
}

let { code: q1k3 } = await classicScripts('q1k3', 'index.html')
for (const [loader, asset] of [
  ['map_load_container', 'l'],
  ['model_load_container', 'm']
]) {
  const data = await readFile(path.join(vendor, 'q1k3', asset))
  const original = `${loader}(/*DEBUG[*/ 'build/' + /*]*/ '${asset}')`
  if (!q1k3.includes(original)) throw new Error(`Missing Q1K3 loader: ${asset}`)
  q1k3 = q1k3.replace(original, `${loader}(${JSON.stringify(data.toString('base64'))})`)
}
q1k3 = q1k3.replaceAll(
  'new Uint8Array(await (await fetch(path)).arrayBuffer())',
  'Uint8Array.from(atob(path), char => char.charCodeAt(0))'
)
// The game keeps updating after pointer unlock; freeze simulation until the next click.
q1k3 = q1k3.replace('game_tick = Math.min(', 'game_tick = document.pointerLockElement ? Math.min(')
q1k3 = q1k3.replace(
  '(time_now - (game_real_time_last||time_now)),0.05);',
  '(time_now - (game_real_time_last||time_now)),0.05) : 0;'
)
q1k3 +=
  '\ndocument.addEventListener("pointerlockchange", () => { if (!document.pointerLockElement) keys.fill(0) });'
q1k3 = q1k3.replace(
  'mouse_x += ev.movementX;',
  'if (!document.pointerLockElement) return; mouse_x += ev.movementX;'
)
q1k3 +=
  '\ndocument.head.insertAdjacentHTML("beforeend", "<style>#c{height:calc(100vh - 80px)}#g{margin:0}body p{margin:5px}</style>");'
await emit('q1k3', await minify(localizeSource(q1k3)))

const audio = await readFile(path.join(vendor, 'q1k3/source/audio.js'), 'utf8')
await writeFile(path.join(output, 'q1k3/SONANT-X-LICENSE'), audio.slice(0, audio.indexOf('let ')))

function inlineScript (html) {
  return [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]).join('\n')
}

function omitProperties (source, names) {
  const ast = ts.createSourceFile('game.js', source, ts.ScriptTarget.Latest, true)
  const edits = []
  function visit (node) {
    if (ts.isPropertyAssignment(node) && names.includes(node.name.getText(ast))) {
      let end = node.end
      if (source[end] === ',') end++
      edits.push([node.getStart(ast), end])
    } else ts.forEachChild(node, visit)
  }
  visit(ast)
  for (const [start, end] of edits.sort((a, b) => b[0] - a[0])) { source = source.slice(0, start) + source.slice(end) }
  return source
}

let common = await readFile(path.join(vendor, 'racer/common.js'), 'utf8')
common = omitProperties(common, ['stats', 'playMusic', 'loadImages', 'background'])
common = common.replace('window.localStorage || {}', 'localStorage')
common = common
  .replace(/stats\s*= options.stats,[^\n]*\n/, '')
  .replace('stats.update();', '')
  .replace('Game.playMusic();', '')
let racer = inlineScript(await readFile(path.join(vendor, 'racer/v4.final.html'), 'utf8'))
racer = racer.slice(0, racer.indexOf("    Dom.on('resolution'"))
racer = racer
  .replace(/var stats\s*= Game.stats\('fps'\);[^\n]*\n/, '')
  .replace('stats: stats,', '')
  .replace('refreshTweakUI();', '')
racer = racer.replace('1024;', '960;').replace('768;', '540;')
racer = racer.replace(
  'lastLapTime <= Util.toFloat(Dom.storage.fast_lap_time)',
  '!Dom.storage.fast_lap_time || lastLapTime <= Util.toFloat(Dom.storage.fast_lap_time)'
)
racer = racer.replace('Dom.storage.fast_lap_time = Dom.storage.fast_lap_time || 180;', '')
racer = racer.replace(
  'formatTime(Util.toFloat(Dom.storage.fast_lap_time))',
  "Dom.storage.fast_lap_time ? formatTime(Util.toFloat(Dom.storage.fast_lap_time)) : '—'"
)
await emit('racer', await minify(common + '\n;(' + installRacer.toString() + ')();\n' + racer), {
  markup:
    '<div id="hud"><span>速度 <b id="speed_value">0</b> mph</span><span>本圈 <b id="current_lap_time_value">0.0</b></span><span id="last_lap_time">上圈 <b id="last_lap_time_value">—</b></span><span id="fast_lap_time">最佳 <b id="fast_lap_time_value">—</b></span></div><canvas id="canvas" aria-label="公路赛车画面"></canvas><div class="controls"><button data-drive="left">左转</button><button data-drive="up">加速</button><button data-drive="down">刹车</button><button data-drive="right">右转</button><button id="pause">暂停</button><button id="restart">重新开始</button></div>',
  style:
    'body{font:12px system-ui;color:#edf4fa}#hud,.controls{display:flex;justify-content:center;gap:10px;align-items:center;flex-wrap:wrap;padding:8px}#canvas{display:block;width:100%;height:calc(100vh - 94px);object-fit:contain;background:#102332}.controls button{touch-action:none;background:#273b4b;color:#fff;border:0;border-radius:6px;padding:7px 10px}.fastest{color:#ffdf92}'
})

let tetris = inlineScript(await readFile(path.join(vendor, 'tetris/index.html'), 'utf8'))
tetris = tetris
  .replace(/stats\s*= new Stats\(\),/, '')
  .replace('showStats();', '')
  .replace('stats.update();', '')
tetris = tetris.replace(/function showStats\(\)\s*{[\s\S]*?}/, '')
tetris = tetris.replace('dy = canvas.height / ny;', 'dy = canvas.height / ny; ucanvas.width = nu * dx; ucanvas.height = nu * dy;')
tetris = tetris.replace('setVisualScore(vscore + 1)', 'setVisualScore(Math.min(score, vscore + Math.max(1, Math.ceil((score - vscore) / 6))))')
for (const [from, to] of Object.entries({ cyan: '#58c6d4', blue: '#7195e6', orange: '#e8ab67', yellow: '#ead278', green: '#80c594', purple: '#b391d5', red: '#e58385' })) {
  tetris = tetris.replace(`color: '${from}'`, `color: '${to}'`)
}
await emit('tetris', await minify(tetris + '\n;(' + installTetris.toString() + ')();'), {
  markup:
    '<main id="tetris"><canvas id="canvas" aria-label="俄罗斯方块棋盘"></canvas><section id="menu"><h2>俄罗斯方块</h2><p>下一个</p><canvas id="upcoming"></canvas><p>得分 <b id="score">00000</b></p><p>消行 <b id="rows">0</b></p><p>最高分 <b id="best">0</b></p><button id="start">开始游戏</button><button id="pause">暂停</button><button id="restart">重新开始</button></section></main><p id="status">点击开始，或按空格开始游戏</p><div class="controls"><button data-key="37">左移</button><button data-key="38">旋转</button><button data-key="39">右移</button><button data-key="40">下落</button><button data-key="32">落到底</button></div>',
  style:
    'body{font:13px system-ui;color:#e2e9f4;background:#172131}#tetris{display:flex;justify-content:center;gap:20px;padding:12px 8px 0;height:calc(100vh - 100px);box-sizing:border-box}#canvas{height:100%;width:auto;aspect-ratio:1/2;background-color:#101925;background-image:linear-gradient(#ffffff08 1px,transparent 1px),linear-gradient(90deg,#ffffff08 1px,transparent 1px);background-size:10% 5%;border:1px solid #526277;border-radius:6px}#menu{width:112px;flex-shrink:0}h2{font-size:18px;margin:0 0 8px}p{margin:7px 0}#upcoming{width:70px;height:70px;background:#26354a;border-radius:8px}button{background:#344761;color:#fff;border:0;border-radius:6px;padding:7px 9px;margin:3px 2px}#status,.controls{text-align:center}#status{font-size:11px}@media(max-height:350px){#menu{font-size:11px}#upcoming{width:40px;height:40px}h2{font-size:14px}button{padding:5px}#tetris{gap:12px}}'
})
