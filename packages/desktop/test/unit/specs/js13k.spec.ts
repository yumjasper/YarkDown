import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import {
  JS13K_GAMES,
  JS13K_STORAGE_PREFIX,
  gameSnapshot,
  isGameStorage
} from '@/services/arcade/js13k'

describe('isolated js13k records', () => {
  it('only exposes bounded records belonging to the selected game', () => {
    const records = new Map([
      [`${JS13K_STORAGE_PREFIX}racer:fast_lap_time`, '100000000000'],
      [`${JS13K_STORAGE_PREFIX}tetris:best`, '42'],
      ['editor-document', 'private content']
    ])
    const storage = { getItem: (key: string) => records.get(key) ?? null } as Storage
    expect(gameSnapshot(storage, JS13K_GAMES[1])).toEqual({ fast_lap_time: '100000000000' })
    expect(gameSnapshot(storage, JS13K_GAMES[2])).toEqual({ best: '42' })
    records.set(`${JS13K_STORAGE_PREFIX}racer:fast_lap_time`, 'x'.repeat(4097))
    expect(gameSnapshot(storage, JS13K_GAMES[1])).toEqual({})
  })

  it('rejects document keys, other games, oversized or structured messages', () => {
    const game = JS13K_GAMES[1]
    expect(isGameStorage(game, 'fast_lap_time', '101')).toBe(true)
    expect(isGameStorage(game, 'fast_lap_time', null)).toBe(true)
    expect(isGameStorage(game, 'best', '10')).toBe(false)
    expect(isGameStorage(game, '__proto__', '10')).toBe(false)
    expect(isGameStorage(game, 'editor-document', '10')).toBe(false)
    expect(isGameStorage(game, 'fast_lap_time', 'x'.repeat(4097))).toBe(false)
    expect(isGameStorage(game, 'fast_lap_time', { score: 10 })).toBe(false)
  })

  it('Q1K3 does not accept any saved record', () => {
    expect(isGameStorage(JS13K_GAMES[0], 'fast_lap_time', '10')).toBe(false)
    expect(isGameStorage(JS13K_GAMES[0], 'best', '10')).toBe(false)
  })

  it('bridges both Storage methods and property writes without accessing host storage', () => {
    const source = readFileSync(
      path.resolve(__dirname, '../../../../../scripts/js13k-bridge.mjs'),
      'utf8'
    )
    const messages: unknown[] = []
    const storage = vm.runInNewContext(
      source.replace('export function', 'function') + ';createGameStorage()',
      {
        window: {
          location: { hash: '#' + encodeURIComponent(JSON.stringify({ fast_lap_time: '65.1' })) },
          parent: { postMessage: (value: unknown) => messages.push(value) },
          addEventListener: () => {}
        },
        document: { addEventListener: () => {} }
      }
    ) as Storage
    expect(storage['fast_lap_time']).toBe('65.1')
    storage['fast_lap_time'] = '64.9'
    expect(storage.getItem('fast_lap_time')).toBe('64.9')
    storage.removeItem('fast_lap_time')
    expect(storage.getItem('fast_lap_time')).toBeNull()
    expect(messages).toEqual([
      { channel: 'yarktext-js13k', type: 'save', key: 'fast_lap_time', value: '64.9' },
      { channel: 'yarktext-js13k', type: 'save', key: 'fast_lap_time', value: null }
    ])
  })
})
