export type GameId = 'merge' | 'sudoku' | 'match'
export type Direction = 'left' | 'right' | 'up' | 'down'
export type Random = () => number

export interface GameState {
  game: GameId
  board: number[]
  solution: number[]
  fixed: number[]
  score: number
  moves: number
  over: boolean
}

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
  return board.some((value, i) => !value ||
    (i % 4 < 3 && value === board[i + 1]) ||
    (i < 12 && value === board[i + 4]))
}

function addTile(board: number[], random: Random): void {
  const empty = board.flatMap((value, i) => value === 0 ? [i] : [])
  if (empty.length) board[empty[pick(empty.length, random)]] = random() < 0.9 ? 2 : 4
}

export function moveMerge(state: GameState, direction: Direction, random: Random = Math.random): GameState {
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
    const merged = mergeLine(indices.map(i => board[i]))
    indices.forEach((index, i) => { board[index] = merged.line[i] })
    points += merged.points
  }
  if (board.every((value, i) => value === state.board[i])) return state
  addTile(board, random)
  return { ...state, board, score: state.score + points, moves: state.moves + 1, over: !canMerge(board) }
}

export function sudokuCandidates(board: number[], index: number): number[] {
  const row = Math.floor(index / 6)
  const column = index % 6
  const used = new Set<number>()
  for (let i = 0; i < 36; i++) {
    const r = Math.floor(i / 6)
    const c = i % 6
    if (r === row || c === column ||
      (Math.floor(r / 2) === Math.floor(row / 2) && Math.floor(c / 3) === Math.floor(column / 3))) {
      used.add(board[i])
    }
  }
  return [1, 2, 3, 4, 5, 6].filter(value => !used.has(value))
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
  if (state.over || index < 0 || index >= 36 || state.board[index] || state.solution[index] !== value) return state
  const board = [...state.board]
  board[index] = value
  const over = board.every(Boolean)
  return { ...state, board, moves: state.moves + 1, score: state.score + 10 + (over ? 100 : 0), over }
}

export function findMatches(board: number[]): number[] {
  const matches = new Set<number>()
  for (let i = 0; i < 49; i++) {
    if (i % 7 < 5 && board[i] === board[i + 1] && board[i] === board[i + 2]) {
      matches.add(i).add(i + 1).add(i + 2)
    }
    if (i < 35 && board[i] === board[i + 7] && board[i] === board[i + 14]) {
      matches.add(i).add(i + 7).add(i + 14)
    }
  }
  return [...matches]
}

export function adjacent(a: number, b: number): boolean {
  return a >= 0 && a < 49 && b >= 0 && b < 49 &&
    Math.abs(Math.floor(a / 7) - Math.floor(b / 7)) + Math.abs(a % 7 - b % 7) === 1
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

export function createMatchBoard(random: Random = Math.random): number[] {
  // A known playable fallback also bounds startup under a degenerate random source.
  const fallback = Array.from({ length: 49 }, (_, i) => (Math.floor(i / 7) + i % 7) % 6)
  fallback[0] = 0
  fallback[1] = 1
  fallback[2] = 0
  fallback[8] = 0
  for (let attempt = 0; attempt < 100; attempt++) {
    const board: number[] = []
    for (let i = 0; i < 49; i++) {
      const choices = [0, 1, 2, 3, 4, 5].filter(value =>
        !(i % 7 >= 2 && board[i - 1] === value && board[i - 2] === value) &&
        !(i >= 14 && board[i - 7] === value && board[i - 14] === value))
      board.push(choices[pick(choices.length, random)])
    }
    if (hasMatchMove(board)) return board
  }
  return fallback
}

export interface MatchResult { state: GameState; combo: number; reshuffled: boolean }

export function swapMatch(state: GameState, a: number, b: number, random: Random = Math.random): MatchResult {
  const unchanged = { state, combo: 0, reshuffled: false }
  if (!adjacent(a, b) || state.board[a] === state.board[b]) return unchanged
  let board = [...state.board]
  ;[board[a], board[b]] = [board[b], board[a]]
  let matches = findMatches(board)
  if (!matches.length) return unchanged
  let score = state.score
  let combo = 0
  while (matches.length && combo < 50) {
    combo++
    score += matches.length * 10 * combo
    const cleared = new Set(matches)
    for (let column = 0; column < 7; column++) {
      const kept = Array.from({ length: 7 }, (_, row) => row * 7 + column)
        .filter(index => !cleared.has(index)).map(index => board[index])
      const values = [...Array.from({ length: 7 - kept.length }, () => pick(6, random)), ...kept]
      values.forEach((value, row) => { board[row * 7 + column] = value })
    }
    matches = findMatches(board)
  }
  const reshuffled = matches.length > 0 || !hasMatchMove(board)
  if (reshuffled) board = createMatchBoard(random)
  return { state: { ...state, board, score, moves: state.moves + 1 }, combo, reshuffled }
}

export function newGame(game: GameId, random: Random = Math.random): GameState {
  const state: GameState = { game, board: [], solution: [], fixed: [], score: 0, moves: 0, over: false }
  if (game === 'merge') {
    state.board = Array(16).fill(0)
    addTile(state.board, random)
    addTile(state.board, random)
  } else if (game === 'match') state.board = createMatchBoard(random)
  else {
    const digits = shuffle([1, 2, 3, 4, 5, 6], random)
    const rows = shuffle([0, 1, 2], random).flatMap(group => shuffle([group * 2, group * 2 + 1], random))
    const columns = shuffle([0, 1], random).flatMap(group => shuffle([group * 3, group * 3 + 1, group * 3 + 2], random))
    state.solution = rows.flatMap(row => columns.map(column => digits[(row * 3 + Math.floor(row / 2) + column) % 6]))
    state.board = [...state.solution]
    let removed = 0
    for (const index of shuffle(Array.from({ length: 36 }, (_, i) => i), random)) {
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
