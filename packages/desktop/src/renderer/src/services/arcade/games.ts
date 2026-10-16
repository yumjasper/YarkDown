export type GameId = 'merge' | 'sudoku' | 'match'
export type Direction = 'left' | 'right' | 'up' | 'down'
export type Random = () => number

export interface GameState {
  stage?: MatchStage
  game: GameId
  board: number[]
  solution: number[]
  fixed: number[]
  score: number
  moves: number
  over: boolean
}
export interface MatchStage {
  level: number
  target: number
  points: number
  movesLeft: number
  charge: number
  stars: number
  reward: number
  status: 'playing' | 'won' | 'lost'
}
export const createMatchStage = (level = 1): MatchStage => ({
  level,
  target: Math.min(3200, 350 + (level - 1) * 150),
  points: 0,
  movesLeft: Math.max(20, 30 - Math.floor((level - 1) / 3)),
  charge: 0,
  stars: 0,
  reward: 0,
  status: 'playing'
})

const pick = (length: number, random: Random): number => Math.floor(random() * length)

function shuffle<T>(items: T[], random: Random): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = pick(i + 1, random)
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

export function mergeLine(line: number[]): { line: number[]; points: number } {
  const values = line.filter(Boolean)
  const result: number[] = []
  let points = 0
  for (let i = 0; i < values.length; i++) {
    if (values[i] === values[i + 1]) {
      const value = values[i] * 2
      result.push(value)
      points += value
      i++
    } else result.push(values[i])
  }
  return { line: [...result, ...Array(line.length - result.length).fill(0)], points }
}

export function canMerge(board: number[]): boolean {
  return board.some(
    (value, i) =>
      !value || (i % 4 < 3 && value === board[i + 1]) || (i < 12 && value === board[i + 4])
  )
}

function addTile(board: number[], random: Random): void {
  const empty = board.flatMap((value, i) => (value === 0 ? [i] : []))
  if (empty.length) board[empty[pick(empty.length, random)]] = random() < 0.9 ? 2 : 4
}

export function moveMerge(
  state: GameState,
  direction: Direction,
  random: Random = Math.random
): GameState {
  if (state.over) return state
  const board = [...state.board]
  let points = 0
  for (let lane = 0; lane < 4; lane++) {
    const indices = Array.from({ length: 4 }, (_, i) => {
      if (direction === 'left') return lane * 4 + i
      if (direction === 'right') return lane * 4 + 3 - i
      if (direction === 'up') return i * 4 + lane
      return (3 - i) * 4 + lane
    })
    const merged = mergeLine(indices.map((i) => board[i]))
    indices.forEach((index, i) => {
      board[index] = merged.line[i]
    })
    points += merged.points
  }
  if (board.every((value, i) => value === state.board[i])) return state
  addTile(board, random)
  return {
    ...state,
    board,
    score: state.score + points,
    moves: state.moves + 1,
    over: !canMerge(board)
  }
}

export function sudokuCandidates(board: number[], index: number): number[] {
  const row = Math.floor(index / 6)
  const column = index % 6
  const used = new Set<number>()
  for (let i = 0; i < 36; i++) {
    const r = Math.floor(i / 6)
    const c = i % 6
    if (
      r === row ||
      c === column ||
      (Math.floor(r / 2) === Math.floor(row / 2) && Math.floor(c / 3) === Math.floor(column / 3))
    ) {
      used.add(board[i])
    }
  }
  return [1, 2, 3, 4, 5, 6].filter((value) => !used.has(value))
}

export function countSudokuSolutions(board: number[], limit = 2): number {
  let index = -1
  let candidates: number[] = []
  for (let i = 0; i < 36; i++) {
    if (board[i]) continue
    const choices = sudokuCandidates(board, i)
    if (!choices.length) return 0
    if (index < 0 || choices.length < candidates.length) {
      index = i
      candidates = choices
    }
  }
  if (index < 0) return 1
  let total = 0
  for (const value of candidates) {
    const next = [...board]
    next[index] = value
    total += countSudokuSolutions(next, limit - total)
    if (total >= limit) break
  }
  return total
}

export function fillSudoku(state: GameState, index: number, value: number): GameState {
  if (
    state.over ||
    index < 0 ||
    index >= 36 ||
    state.board[index] ||
    state.solution[index] !== value
  )
    return state
  const board = [...state.board]
  board[index] = value
  const over = board.every(Boolean)
  return {
    ...state,
    board,
    moves: state.moves + 1,
    score: state.score + 10 + (over ? 100 : 0),
    over
  }
}

export function findMatches(board: number[]): number[] {
  const matches = new Set<number>()
  for (let i = 0; i < 49; i++) {
    if (i % 7 < 5 && board[i] === board[i + 1] && board[i] === board[i + 2]) {
      matches
        .add(i)
        .add(i + 1)
        .add(i + 2)
    }
    if (i < 35 && board[i] === board[i + 7] && board[i] === board[i + 14]) {
      matches
        .add(i)
        .add(i + 7)
        .add(i + 14)
    }
  }
  return [...matches]
}

export function adjacent(a: number, b: number): boolean {
  return (
    a >= 0 &&
    a < 49 &&
    b >= 0 &&
    b < 49 &&
    Math.abs(Math.floor(a / 7) - Math.floor(b / 7)) + Math.abs((a % 7) - (b % 7)) === 1
  )
}

export function hasMatchMove(board: number[]): boolean {
  for (let i = 0; i < 49; i++) {
    for (const j of [i + 1, i + 7]) {
      if (!adjacent(i, j) || board[i] === board[j]) continue
      const next = [...board]
      ;[next[i], next[j]] = [next[j], next[i]]
      if (findMatches(next).length) return true
    }
  }
  return false
}

export function createMatchBoard(random: Random = Math.random, colors = 5): number[] {
  // A known playable fallback also bounds startup under a degenerate random source.
  const fallback = Array.from({ length: 49 }, (_, i) => (Math.floor(i / 7) + (i % 7)) % colors)
  fallback[0] = 0
  fallback[1] = 1
  fallback[2] = 0
  fallback[8] = 0
  for (let attempt = 0; attempt < 100; attempt++) {
    const board: number[] = []
    for (let i = 0; i < 49; i++) {
      const choices = Array.from({ length: colors }, (_, n) => n).filter(
        (value) =>
          !(i % 7 >= 2 && board[i - 1] === value && board[i - 2] === value) &&
          !(i >= 14 && board[i - 7] === value && board[i - 14] === value)
      )
      board.push(choices[pick(choices.length, random)])
    }
    if (hasMatchMove(board)) return board
  }
  return fallback
}

export interface MatchWave {
  board: number[]
  cleared: number[]
  after: number[]
  points: number
  effect: 'match' | 'line' | 'rainbow' | 'burst'
}
export interface MatchResult {
  state: GameState
  combo: number
  reshuffled: boolean
  waves?: MatchWave[]
  swapped?: number[]
  before?: number[]
  pair?: number[]
  reward?: number
}

const blastArea = (center: number): number[] =>
  Array.from({ length: 49 }, (_, i) => i).filter(
    (i) =>
      Math.abs(Math.floor(i / 7) - Math.floor(center / 7)) <= 1 &&
      Math.abs((i % 7) - (center % 7)) <= 1
  )

function longestMatch(board: number[]): { length: number; index: number } {
  let best = { length: 0, index: 0 }
  for (let start = 0; start < 49; start++)
    for (const step of [1, 7]) {
      let length = 1
      while (
        start + length * step < 49 &&
        (step === 7 || (start % 7) + length < 7) &&
        board[start + length * step] === board[start]
      )
        length++
      if (length > best.length) best = { length, index: start }
    }
  return best
}

export function swapMatch(
  state: GameState,
  a: number,
  b: number,
  random: Random = Math.random
): MatchResult {
  const unchanged = { state, combo: 0, reshuffled: false }
  const stage = { ...(state.stage || createMatchStage()) }
  if (state.over || stage.status !== 'playing' || !adjacent(a, b)) return unchanged
  let board = [...state.board]
  ;[board[a], board[b]] = [board[b], board[a]]
  const swapped = [...board]
  stage.movesLeft--
  stage.charge++
  let matches = findMatches(board)
  const charged = stage.charge >= 4
  if (charged) {
    stage.charge = 0
    matches = [...new Set([...matches, ...blastArea(b)])]
  }
  let score = state.score
  let combo = 0
  const waves: MatchWave[] = []
  const colors = stage.level < 5 ? 5 : 6
  // Bound computation and playback when refills repeatedly match, including a constant random source.
  while (matches.length && combo < 12) {
    combo++
    const cleared = new Set(matches)
    const longest = longestMatch(board)
    let effect: MatchWave['effect'] = combo === 1 && charged ? 'burst' : 'match'
    if (longest.length >= 5) {
      effect = 'rainbow'
      board.forEach((color, i) => {
        if (color === board[longest.index]) cleared.add(i)
      })
    } else if (longest.length >= 4) {
      effect = 'line'
      const row = Math.floor(longest.index / 7)
      for (let column = 0; column < 7; column++) cleared.add(row * 7 + column)
    }
    const points = cleared.size * 10 * combo
    score += points
    const before = [...board]
    for (let column = 0; column < 7; column++) {
      const kept = Array.from({ length: 7 }, (_, row) => row * 7 + column)
        .filter((index) => !cleared.has(index))
        .map((index) => board[index])
      const values = [
        ...Array.from({ length: 7 - kept.length }, () => pick(colors, random)),
        ...kept
      ]
      values.forEach((value, row) => {
        board[row * 7 + column] = value
      })
    }
    waves.push({ board: before, cleared: [...cleared], after: [...board], points, effect })
    matches = findMatches(board)
  }
  const reshuffled = matches.length > 0 || (combo > 0 && !hasMatchMove(board))
  if (reshuffled) board = createMatchBoard(random, colors)
  stage.points += score - state.score
  let reward = 0
  if (stage.points >= stage.target) {
    stage.status = 'won'
    stage.stars = stage.movesLeft >= 8 ? 3 : stage.movesLeft >= 3 ? 2 : 1
    reward = stage.movesLeft * 10 + stage.stars * 50
    stage.reward = reward
    score += reward
  } else if (!stage.movesLeft) stage.status = 'lost'
  return {
    state: {
      ...state,
      board,
      score,
      moves: state.moves + 1,
      stage,
      over: stage.status !== 'playing'
    },
    combo,
    reshuffled,
    waves,
    swapped,
    before: [...state.board],
    pair: [a, b],
    reward
  }
}

export function progressMatch(
  state: GameState,
  action: 'next' | 'retry' | 'continue',
  random: Random = Math.random
): GameState {
  if (state.game !== 'match') return state
  const stage = state.stage || createMatchStage()
  if (action === 'next' && stage.status !== 'won') return state
  if (action === 'continue')
    return stage.status !== 'lost'
      ? state
      : { ...state, over: false, stage: { ...stage, movesLeft: 5, status: 'playing' } }
  const next = createMatchStage(stage.level + (action === 'next' ? 1 : 0))
  return {
    ...state,
    board: createMatchBoard(random, next.level < 5 ? 5 : 6),
    over: false,
    stage: next
  }
}

export function newGame(game: GameId, random: Random = Math.random): GameState {
  const state: GameState = {
    game,
    board: [],
    solution: [],
    fixed: [],
    score: 0,
    moves: 0,
    over: false
  }
  if (game === 'merge') {
    state.board = Array(16).fill(0)
    addTile(state.board, random)
    addTile(state.board, random)
  } else if (game === 'match') {
    state.board = createMatchBoard(random)
    state.stage = createMatchStage()
  } else {
    const digits = shuffle([1, 2, 3, 4, 5, 6], random)
    const rows = shuffle([0, 1, 2], random).flatMap((group) =>
      shuffle([group * 2, group * 2 + 1], random)
    )
    const columns = shuffle([0, 1], random).flatMap((group) =>
      shuffle([group * 3, group * 3 + 1, group * 3 + 2], random)
    )
    state.solution = rows.flatMap((row) =>
      columns.map((column) => digits[(row * 3 + Math.floor(row / 2) + column) % 6])
    )
    state.board = [...state.solution]
    let removed = 0
    for (const index of shuffle(
      Array.from({ length: 36 }, (_, i) => i),
      random
    )) {
      const value = state.board[index]
      state.board[index] = 0
      if (countSudokuSolutions(state.board) !== 1) state.board[index] = value
      else removed++
      if (removed >= 20) break
    }
    state.fixed = [...state.board]
  }
  return state
}
