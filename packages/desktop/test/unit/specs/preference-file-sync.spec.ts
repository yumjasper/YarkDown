import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'

// Startup defaults and schema defaults must expose the same persisted settings.

const DEFAULTS_PATH = path.join(__dirname, '../../../static/preference.json')
const SCHEMA_PATH = path.join(__dirname, '../../../src/main/preferences/schema.json')

interface SchemaEntry {
  type?: string
  default?: unknown
}

const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8')) as Record<string, SchemaEntry>
const defaults = JSON.parse(fs.readFileSync(DEFAULTS_PATH, 'utf8')) as Record<string, unknown>

const typeOf = (value: unknown): string => {
  if (Array.isArray(value)) return 'array'
  if (value === null) return 'null'
  return typeof value
}

const KEY = 'showPandocConvert'

describe('static/preference.json stays in sync with the preference schema', () => {
  it('keeps every persisted preference in both the schema and the startup defaults', () => {
    expect(Object.keys(defaults).sort()).toEqual(Object.keys(schema).sort())
    for (const key of ['txtToolbarExpanded', 'txtWordWrap', 'txtLineNumbers', 'txtFontFamily', 'txtFontSize', 'txtTabSize']) {
      expect(defaults[key]).toEqual(schema[key]?.default)
    }
  })
  it('lists the switch this change declares, so it is not dropped on restart', () => {
    expect(defaults, `add ${KEY} to static/preference.json`).toHaveProperty(KEY)
  })

  it('gives the switch the type the schema declares', () => {
    const entry = schema[KEY]
    expect(typeOf(defaults[KEY])).toBe(entry?.type)
  })

  // The schema default is what a pruned key comes back as, and what PREFERENCES.md publishes;
  // the file holds what the first start writes. Nothing at runtime compares the two.
  it('gives the switch the value the schema calls its default', () => {
    expect(defaults[KEY]).toEqual(schema[KEY]?.default)
  })
})
