import { createMatchStage, newGame, type GameId, type GameState } from './games'

export const ARCADE_KEY = 'yarktext.arcade.v1'
export const GAME_IDS: GameId[] = ['merge', 'sudoku', 'match']
export const GAME_LABELS: Record<GameId, string> = {
  merge: '2048',
  sudoku: '迷你数独',
  match: '轻消消'
}

export interface Session {
  id: string
  player: string
  credited: number
  state: GameState
}

export interface ScoreEntry {
  id: string
  player: string
  score: number
  date: string
}

export interface Player {
  name: string
  totals: Record<GameId, number>
  best: Record<GameId, number>
}

export interface ArcadeData {
  version: 1
  player: string
  selected: GameId
  players: Player[]
  sessions: Partial<Record<GameId, Session>>
  rankings: Record<GameId, ScoreEntry[]>
}

export const emptyArcade = (): ArcadeData => ({
  version: 1,
  player: '我',
  selected: 'merge',
  players: [],
  sessions: {},
  rankings: { merge: [], sudoku: [], match: [] }
})

const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)
const integer = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) >= 0
const name = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= 24
const numbers = (value: unknown, size: number, max: number): value is number[] =>
  Array.isArray(value) && value.length === size && value.every((n) => integer(n) && n <= max)

function validState(value: unknown, game: GameId): value is GameState {
  if (
    !object(value) ||
    value.game !== game ||
    !integer(value.score) ||
    !integer(value.moves) ||
    typeof value.over !== 'boolean'
  )
    return false
  if (!Array.isArray(value.solution) || !Array.isArray(value.fixed)) return false
  if (game === 'merge')
    return (
      numbers(value.board, 16, 2 ** 50) &&
      value.board.every((n) => n === 0 || Number.isInteger(Math.log2(n)))
    )
  if (game === 'match') {
    if (!numbers(value.board, 49, 5)) return false
    if (value.stage === undefined) value.stage = createMatchStage()
    const stage = value.stage
    if (object(stage) && stage.reward === undefined) stage.reward = 0
    return (
      object(stage) &&
      integer(stage.level) &&
      stage.level > 0 &&
      integer(stage.target) &&
      stage.target > 0 &&
      integer(stage.points) &&
      stage.points <= value.score &&
      integer(stage.movesLeft) &&
      integer(stage.charge) &&
      stage.charge < 4 &&
      integer(stage.stars) &&
      stage.stars <= 3 &&
      integer(stage.reward) &&
      ['playing', 'won', 'lost'].includes(String(stage.status)) &&
      value.over === (stage.status !== 'playing') &&
      (stage.status !== 'playing' || stage.movesLeft > 0)
    )
  }
  return (
    numbers(value.board, 36, 6) &&
    numbers(value.solution, 36, 6) &&
    value.solution.every((n) => n > 0) &&
    numbers(value.fixed, 36, 6) &&
    value.board.every((n, i) => n === 0 || n === (value.solution as number[])[i])
  )
}

export function readArcade(storage: Pick<Storage, 'getItem'>): ArcadeData {
  const text = storage.getItem(ARCADE_KEY)
  if (!text) return emptyArcade()
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('小游戏存档无法解析，原数据已保留。')
  }
  if (
    !object(data) ||
    data.version !== 1 ||
    !name(data.player) ||
    !GAME_IDS.includes(data.selected as GameId) ||
    !Array.isArray(data.players) ||
    !object(data.sessions) ||
    !object(data.rankings)
  )
    throw new Error('小游戏存档格式不兼容，原数据已保留。')
  for (const player of data.players) {
    if (
      !object(player) ||
      !name(player.name) ||
      !object(player.totals) ||
      !object(player.best) ||
      !GAME_IDS.every(
        (game) =>
          integer((player.totals as Record<string, unknown>)[game]) &&
          integer((player.best as Record<string, unknown>)[game])
      )
    )
      throw new Error('小游戏积分数据损坏，原数据已保留。')
  }
  for (const game of GAME_IDS) {
    const session = data.sessions[game]
    if (
      session !== undefined &&
      (!object(session) ||
        typeof session.id !== 'string' ||
        !name(session.player) ||
        !integer(session.credited) ||
        !validState(session.state, game) ||
        session.credited !== session.state.score)
    ) {
      throw new Error('小游戏局面数据损坏，原数据已保留。')
    }
    const entries = data.rankings[game]
    if (
      !Array.isArray(entries) ||
      entries.length > 20 ||
      entries.some(
        (entry) =>
          !object(entry) ||
          typeof entry.id !== 'string' ||
          !name(entry.player) ||
          !integer(entry.score) ||
          typeof entry.date !== 'string' ||
          !Number.isFinite(Date.parse(entry.date))
      )
    ) {
      throw new Error('小游戏榜单数据损坏，原数据已保留。')
    }
  }
  return data as unknown as ArcadeData
}

export function startSession(data: ArcadeData, game: GameId, playerName: string): Session {
  const player = playerName.trim().slice(0, 24) || '我'
  data.player = player
  data.selected = game
  if (!data.players.some((entry) => entry.name === player)) {
    data.players.push({
      name: player,
      totals: { merge: 0, sudoku: 0, match: 0 },
      best: { merge: 0, sudoku: 0, match: 0 }
    })
  }
  const session: Session = { id: crypto.randomUUID(), player, credited: 0, state: newGame(game) }
  data.sessions[game] = session
  return session
}

export function creditSession(
  data: ArcadeData,
  session: Session,
  now = new Date().toISOString()
): void {
  const score = session.state.score
  if (!integer(score) || score < session.credited) throw new Error('积分变化无效。')
  if (score === session.credited) return
  const player = data.players.find((entry) => entry.name === session.player)
  if (!player) throw new Error('找不到本局玩家。')
  const game = session.state.game
  const total = player.totals[game] + score - session.credited
  if (!Number.isSafeInteger(total)) throw new Error('积分已达到本地存储上限。')
  player.totals[game] = total
  player.best[game] = Math.max(player.best[game], score)
  session.credited = score
  if (score > 0) {
    const entries = data.rankings[game].filter((entry) => entry.id !== session.id)
    entries.push({ id: session.id, player: session.player, score, date: now })
    data.rankings[game] = entries
      .sort((a, b) => b.score - a.score || a.date.localeCompare(b.date))
      .slice(0, 20)
  }
}

export function saveArcade(storage: Pick<Storage, 'setItem'>, data: ArcadeData): void {
  try {
    storage.setItem(ARCADE_KEY, JSON.stringify(data))
  } catch {
    throw new Error('本次操作未保存，可能是本地存储空间不足。请重试。')
  }
}
