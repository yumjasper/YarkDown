import { describe, expect, it } from 'vitest'
import {
  adjacent, canMerge, countSudokuSolutions, createMatchBoard, fillSudoku,
  findMatches, hasMatchMove, mergeLine, moveMerge, newGame, swapMatch
} from '@/services/arcade/games'
import { ARCADE_KEY, creditSession, emptyArcade, readArcade, saveArcade, startSession } from '@/services/arcade/storage'

function seeded(seed: number): () => number {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 2 ** 32
  }
}

describe('arcade game rules', () => {
  it('merges each 2048 tile once and scores only merged values', () => {
    expect(mergeLine([2, 2, 2, 2])).toEqual({ line: [4, 4, 0, 0], points: 8 })
    expect(mergeLine([4, 4, 8, 0])).toEqual({ line: [8, 8, 0, 0], points: 8 })
    expect(mergeLine([0, 2, 0, 2])).toEqual({ line: [4, 0, 0, 0], points: 4 })
  })

  it('does not spawn tiles or count moves on a no-op and handles all directions', () => {
    const state = newGame('merge', seeded(3))
    state.board = [2, 0, 0, 0, ...Array(12).fill(0)]
    expect(moveMerge(state, 'left')).toBe(state)
    expect(moveMerge(state, 'up')).toBe(state)
    expect(moveMerge(state, 'right', () => 0).board[3]).toBe(2)
    expect(moveMerge(state, 'down', () => 0).board[12]).toBe(2)
    const over = [2, 4, 2, 4, 4, 2, 4, 2, 2, 4, 2, 4, 4, 2, 4, 2]
    expect(canMerge(over)).toBe(false)
    expect(canMerge([0, ...over.slice(1)])).toBe(true)
  })

  it('generates unique 6x6 Sudoku puzzles and only rewards first correct entries', () => {
    for (let seed = 1; seed <= 15; seed++) {
      let state = newGame('sudoku', seeded(seed))
      expect(countSudokuSolutions(state.board)).toBe(1)
      for (let row = 0; row < 6; row++) expect(new Set(state.solution.slice(row * 6, row * 6 + 6)).size).toBe(6)
      for (let column = 0; column < 6; column++) expect(new Set(Array.from({ length: 6 }, (_, row) => state.solution[row * 6 + column])).size).toBe(6)
      const empty = state.board.flatMap((n, i) => n ? [] : [i])
      expect(empty.length).toBeGreaterThan(10)
      const index = empty[0]
      expect(fillSudoku(state, index, state.solution[index] % 6 + 1)).toBe(state)
      state = fillSudoku(state, index, state.solution[index])
      expect(fillSudoku(state, index, state.solution[index])).toBe(state)
      for (const i of empty.slice(1)) state = fillSudoku(state, i, state.solution[i])
      expect(state.over).toBe(true)
      expect(state.score).toBe(empty.length * 10 + 100)
    }
  })

  it('creates stable playable match boards, including a degenerate random source', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const board = createMatchBoard(seeded(seed))
      expect(findMatches(board)).toEqual([])
      expect(hasMatchMove(board)).toBe(true)
    }
    expect(hasMatchMove(createMatchBoard(() => 0))).toBe(true)
    expect(adjacent(6, 7)).toBe(false)
    expect(adjacent(-1, 0)).toBe(false)
    expect(adjacent(0, 7)).toBe(true)
  })

  it('rejects invalid swaps and resolves chains into stable playable boards', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const state = newGame('match', seeded(seed))
      expect(swapMatch(state, 6, 7).state).toBe(state)
      let result = { state, combo: 0, reshuffled: false }
      for (let i = 0; i < 49 && !result.combo; i++) {
        for (const j of [i + 1, i + 7]) {
          result = swapMatch(state, i, j, seeded(seed + 50))
          if (result.combo) break
        }
      }
      expect(result.combo).toBeGreaterThan(0)
      expect(result.state.score).toBeGreaterThanOrEqual(30)
      expect(result.state.moves).toBe(1)
      expect(findMatches(result.state.board)).toEqual([])
      expect(hasMatchMove(result.state.board)).toBe(true)
      expect(state.moves).toBe(0)
    }
  })
})

describe('arcade scores and saves', () => {
  it('credits only score increments and keeps totals across new rounds and reloads', () => {
    localStorage.clear()
    const data = emptyArcade()
    const first = startSession(data, 'match', ' 玩家一 ')
    first.state.score = 120
    creditSession(data, first)
    creditSession(data, first)
    first.state.score = 200
    creditSession(data, first)
    expect(data.players[0].totals.match).toBe(200)
    expect(data.rankings.match).toHaveLength(1)
    const second = startSession(data, 'match', '玩家一')
    second.state.score = 50
    creditSession(data, second)
    expect(data.players[0].totals.match).toBe(250)
    expect(data.players[0].best.match).toBe(200)
    expect(data.rankings.match.map(entry => entry.score)).toEqual([200, 50])
    saveArcade(localStorage, data)
    expect(readArcade(localStorage)).toEqual(data)
  })

  it('separates players and games, bounds leaderboards, and preserves lifetime best', () => {
    const data = emptyArcade()
    const original = startSession(data, 'merge', '__proto__')
    original.state.score = 100
    creditSession(data, original)
    for (let i = 1; i <= 25; i++) {
      const session = startSession(data, 'merge', '第二位玩家')
      session.state.score = i * 200
      creditSession(data, session)
    }
    expect(data.rankings.merge).toHaveLength(20)
    expect(data.players[0].totals.merge).toBe(100)
    expect(data.players[0].best.merge).toBe(100)
    expect(data.players[0].totals.match).toBe(0)
    expect(data.rankings.sudoku).toEqual([])
  })

  it('rejects corrupt saves without replacing them and reports failed writes', () => {
    localStorage.setItem(ARCADE_KEY, '{bad')
    expect(() => readArcade(localStorage)).toThrow('原数据已保留')
    expect(localStorage.getItem(ARCADE_KEY)).toBe('{bad')
    const data = emptyArcade()
    startSession(data, 'match', '我').state.board = [NaN]
    localStorage.setItem(ARCADE_KEY, JSON.stringify(data))
    expect(() => readArcade(localStorage)).toThrow('局面数据损坏')
    expect(() => saveArcade({ setItem: () => { throw new Error('quota') } }, emptyArcade())).toThrow('本次操作未保存')
  })
})
