import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { parse, compileScript } from 'vue/compiler-sfc'
import ts from 'typescript'
import { ref, computed, watch, nextTick } from 'vue'

// Regression guard for the persistent "show only matching lines" mode. The
// filter itself lives in the CodeMirror layer and is keyed on the active query,
// but the find bar's outside-click handler used to dismiss the bar on any click
// into the document — and dismissing emits an empty query, which switches the
// filter off and restores every hidden line. Clicking a filtered result to move
// the caret therefore undid the filter the user explicitly turned on.
//
// The desktop unit runner has no @vitejs/plugin-vue / @vue/test-utils, so the
// real <script setup> is compiled at runtime with its imports stubbed (Vue's own
// ref/computed/watch are kept). Same harness style as search-prefill.spec.ts.

const here = dirname(fileURLToPath(import.meta.url))
const vuePath = resolve(here, '../../../src/renderer/src/components/search/index.vue')

interface Bindings {
  onlyMatches: { value: boolean }
  showSearch: { value: boolean }
  searchValue: { value: string }
  docClick: (event: MouseEvent) => void
  docKeyup: (event: KeyboardEvent) => void
}

const loadBindings = (emitted: Array<{ value: string; opt?: Record<string, unknown> }>) => {
  const src = readFileSync(vuePath, 'utf8')
  const { descriptor } = parse(src)
  const compiled = compileScript(descriptor, { id: 'test' })
  const noImports = compiled.content
    .split('\n')
    .filter((line) => !/^\s*import\s/.test(line))
    .join('\n')
  const js = ts.transpileModule(noImports, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText
  const factory = new Function(
    '__deps',
    'exports',
    'module',
    `const { _defineComponent, ref, computed, watch, onMounted, onBeforeUnmount,
      nextTick, bus, FindCaseIcon, FindWordIcon, FindRegexIcon, useEditorStore,
      storeToRefs, useI18n, debounce, ArrowDown, ArrowUp, RefreshRight, Switch } = __deps
    ${js}
    return module.exports`
  ) as (
    deps: Record<string, unknown>,
    exports: object,
    module: object
  ) => { default: { setup: (props: unknown, ctx: { expose: () => void }) => Bindings } }

  const currentFile = ref({ searchMatches: { matches: [], index: -1, value: '' } })
  const deps = {
    _defineComponent: (options: unknown) => options,
    ref,
    computed,
    watch,
    nextTick,
    onMounted: () => {},
    onBeforeUnmount: () => {},
    bus: {
      on: () => {},
      off: () => {},
      emit: (_event: string, payload: { value: string; opt?: Record<string, unknown> }) =>
        emitted.push(payload)
    },
    FindCaseIcon: {},
    FindWordIcon: {},
    FindRegexIcon: {},
    ArrowDown: {},
    ArrowUp: {},
    RefreshRight: {},
    Switch: {},
    useEditorStore: () => new Proxy({}, { get: () => () => {} }),
    storeToRefs: () => ({ currentFile }),
    useI18n: () => ({ t: (key: string) => key }),
    debounce: (fn: (...args: unknown[]) => unknown) => fn
  }
  const module = { exports: {} as Record<string, unknown> }
  const bindings = factory(deps, module.exports, module).default.setup({}, { expose: () => {} })
  return bindings
}

// A DOM event whose target reports the given ancestor selectors as matched,
// mirroring how the component tests the click position with `closest()`.
const clickOn = (selectors: string[]): MouseEvent => {
  const target = {
    closest: (selector: string) => (selectors.includes(selector) ? ({} as Element) : null)
  } as unknown as HTMLElement
  return { target } as unknown as MouseEvent
}

const openBarWithFilter = () => {
  const emitted: Array<{ value: string; opt?: Record<string, unknown> }> = []
  const bindings = loadBindings(emitted)
  bindings.showSearch.value = true
  bindings.onlyMatches.value = true
  bindings.searchValue.value = 'needle'
  return { bindings, emitted }
}

describe('find bar keeps the filter while the user works in the filtered text', () => {
  it('keeps the bar and the query when clicking into the filtered text', () => {
    const { bindings, emitted } = openBarWithFilter()

    bindings.docClick(clickOn(['.plain-text-content']))

    expect(bindings.showSearch.value).toBe(true)
    expect(bindings.searchValue.value).toBe('needle')
    // Nothing was emitted, so the CodeMirror layer never saw an empty query and
    // the hidden lines stay hidden.
    expect(emitted).toHaveLength(0)
  })

  it('still closes the bar on a click outside the text while filtering', () => {
    const { bindings, emitted } = openBarWithFilter()

    bindings.docClick(clickOn([]))

    expect(bindings.showSearch.value).toBe(false)
    expect(emitted.at(-1)?.value).toBe('')
  })

  it('closes the bar on a click into the text when the filter is off', () => {
    const { bindings, emitted } = openBarWithFilter()
    bindings.onlyMatches.value = false

    bindings.docClick(clickOn(['.plain-text-content']))

    expect(bindings.showSearch.value).toBe(false)
    expect(emitted.at(-1)?.value).toBe('')
  })

  it('stays open when clicking the bar itself, filter on or off', () => {
    const { bindings } = openBarWithFilter()

    bindings.docClick(clickOn(['.search-bar']))

    expect(bindings.showSearch.value).toBe(true)
  })

  it('still exits on Escape while filtering', () => {
    const { bindings, emitted } = openBarWithFilter()

    bindings.docKeyup({ key: 'Escape' } as KeyboardEvent)

    expect(bindings.showSearch.value).toBe(false)
    expect(emitted.at(-1)?.value).toBe('')
  })
})
