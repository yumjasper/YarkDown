import { describe, expect, it } from 'vitest'
import keybindings from '../../../src/main/keyboard/keybindingsWindows'
import { isEqualAccelerator } from '../../../src/common/keybinding'

describe('YarkText Windows default shortcuts', () => {
  it('assigns Ctrl+1 through Ctrl+6 to headings', () => {
    for (let level = 1; level <= 6; level++) {
      expect(keybindings.get(`paragraph.heading-${level}`)).toBe(`Ctrl+${level}`)
    }
  })

  it('leaves numeric tab switching unbound', () => {
    for (const [id, accelerator] of keybindings) {
      if (/^tabs\.switchTo(?!Left|Right)/.test(id)) expect(accelerator).toBe('')
    }
  })

  it('reserves Ctrl+P for file search and Ctrl+/ for source mode', () => {
    expect(keybindings.get('file.quick-open')).toBe('Ctrl+P')
    expect(keybindings.get('file.print')).toBe('')
    expect(keybindings.get('view.source-code-mode')).toBe('Ctrl+/')
  })

  it('has no duplicate nonempty accelerators', () => {
    const bindings = [...keybindings].filter(([, accelerator]) => accelerator)
    for (let i = 0; i < bindings.length; i++) {
      for (let j = i + 1; j < bindings.length; j++) {
        const [firstId, first] = bindings[i]
        const [secondId, second] = bindings[j]
        expect(isEqualAccelerator(first, second), `${firstId} conflicts with ${secondId}`).toBe(
          false
        )
      }
    }
  })
})
