export const JS13K_GAMES = [
  {
    id: 'q1k3',
    title: 'Q1K3',
    name: 'Q1K3',
    subtitle: '3D 第一人称射击 · js13k 2021',
    author: 'Dominic Szablewski / 音乐 Andy Lösch',
    license: 'MIT · Sonant-X: zlib',
    pointerLock: true,
    source: 'https://github.com/phoboslab/q1k3',
    help: '点击画面开始并锁定鼠标。WASD / 方向键移动，鼠标转视角、左键射击，空格或右键跳跃，Q/E 或滚轮换武器。',
    persistence: '原作不提供存档；返回精选或收起后，本局重新开始。',
    keys: []
  },
  {
    id: 'racer',
    title: 'Racer',
    name: '公路赛车',
    subtitle: '经典街机风格 · 伪 3D 公路竞速',
    author: 'Jake Gordon / 场景与车辆重绘：YarkText',
    license: 'MIT',
    pointerLock: false,
    source: 'https://github.com/jakesgordon/javascript-racer',
    help: 'WASD / 方向键驾驶：上加速、下刹车、左右转向。也可按住画面下方按钮驾驶，P 或按钮暂停。避开车流与路边障碍，挑战最佳圈速。',
    persistence: '保存最佳圈速；收起后本局结束。',
    keys: ['fast_lap_time']
  },
  {
    id: 'tetris',
    title: 'Tetris',
    name: '俄罗斯方块',
    subtitle: '红白机时代的经典消行玩法 · 开源复刻',
    author: 'Jake Gordon',
    license: 'MIT',
    pointerLock: false,
    source: 'https://github.com/jakesgordon/javascript-tetris',
    help: '点击或空格开始；左右移动，上键旋转，下键加速下落，空格落到底，P 暂停。也可以点击画面中的操作按钮。填满一整行即可消除。',
    persistence: '保存本机最高分；收起后本局结束。',
    keys: ['best']
  }
] as const

export type Js13kGame = (typeof JS13K_GAMES)[number]
export const JS13K_STORAGE_PREFIX = 'yarktext-js13k:'

export function isGameStorage(game: Js13kGame, key: unknown, value: unknown): key is string {
  return (
    typeof key === 'string' &&
    (game.keys as readonly string[]).includes(key) &&
    (value === null || (typeof value === 'string' && value.length <= 4096))
  )
}

export function gameSnapshot(storage: Storage, game: Js13kGame): Record<string, string> {
  return Object.fromEntries(
    game.keys.flatMap((key) => {
      const value = storage.getItem(JS13K_STORAGE_PREFIX + game.id + ':' + key)
      return value !== null && value.length <= 4096 ? [[key, value]] : []
    })
  )
}
