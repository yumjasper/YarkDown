import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { computed, ref, shallowRef, watch } from 'vue'
import { parse, compileScript } from 'vue/compiler-sfc'
import ts from 'typescript'

interface Bindings {
  refresh: () => void
  cell: { value: unknown }
  popup: { value: string }
  bounds: { value: { left: number; top: number; width: number } }
}

const load = () => {
  const source = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), '../../../src/renderer/src/components/tableTools/index.vue'),
    'utf8'
  )
  const { descriptor } = parse(source)
  const compiled = compileScript(descriptor, { id: 'table-layout-test' })
  const script = compiled.content.replace(/import\s[\s\S]*?from\s+['"][^'"]+['"];?/g, '')
  const js = ts.transpileModule(script, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText
  const getTableCell = vi.fn(() => null as unknown)
  const deps = {
    _defineComponent: (value: unknown) => value,
    computed,
    ref,
    shallowRef,
    watch,
    onBeforeUnmount: () => {},
    onMounted: () => {},
    useI18n: () => ({ t: (key: string) => key }),
    getTableCell,
    performTableAction: vi.fn(),
    resizeTable: vi.fn(),
    tableActionDisabled: vi.fn(),
    tableActions: [],
    bus: {},
    ToolbarIcon: {}
  }
  // Compile the real setup logic without installing a separate SFC test runner.
   
  const factory = new Function(
    '__deps',
    'exports',
    'module',
    `const { ${Object.keys(deps).join(',')} } = __deps; ${js}; return module.exports.default`
  ) as (
    deps: object,
    exports: object,
    module: object
  ) => { setup: (props: object, ctx: object) => Bindings }
  const module = { exports: {} }
  const component = factory(deps, module.exports, module)
  const domNode = document.createElement('div')
  const measure = vi
    .spyOn(domNode, 'getBoundingClientRect')
    .mockReturnValue(new DOMRect(0, 89, 900, 618))
  const bindings = component.setup({ muya: { domNode } }, { expose: () => {} })
  return { bindings, domNode, measure, getTableCell }
}

describe('table toolbar scroll layout', () => {
  it('does not measure the editor during sustained scrolling outside a table', () => {
    const { bindings, measure } = load()
    bindings.popup.value = 'more'
    for (let i = 0; i < 100; i++) bindings.refresh()
    expect(measure).not.toHaveBeenCalled()
    expect(bindings.cell.value).toBeNull()
    expect(bindings.popup.value).toBe('')
  })

  it('does not measure a detached table or missing table element', () => {
    const { bindings, measure, getTableCell } = load()
    getTableCell.mockReturnValue({ outMostBlock: null })
    bindings.refresh()
    getTableCell.mockReturnValue({
      outMostBlock: {},
      table: { domNode: document.createElement('div') }
    })
    bindings.refresh()
    expect(measure).not.toHaveBeenCalled()
    expect(bindings.cell.value).toBeNull()
  })

  it('still positions the toolbar for a visible active table', () => {
    const { bindings, measure, getTableCell } = load()
    const wrapper = document.createElement('div')
    const table = document.createElement('table')
    wrapper.append(table)
    vi.spyOn(table, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 200, 400, 150))
    const cell = { outMostBlock: {}, table: { domNode: wrapper } }
    getTableCell.mockReturnValue(cell)
    bindings.refresh()
    expect(measure).toHaveBeenCalledTimes(1)
    expect(bindings.cell.value).toBe(cell)
    expect(bindings.bounds.value).toEqual({ left: 100, top: 174, width: 400 })
  })
})
