import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CommandType } from '@univerjs/presets'
import { DocController } from '../src/doc/docController'

// The sheet's unsaved flag ("*" in the title) comes from ONE CommandExecuted
// listener in DocController. The real Univer never boots under node, so a
// stand-in facade captures that listener and the tests feed it events shaped
// exactly like the facade's ({ id, type, params, options }).
function controllerWithEvents() {
  let listener: ((event: unknown) => void) | undefined
  const api = {
    Event: { CommandExecuted: 'CommandExecuted' },
    addEvent: (_name: string, cb: (event: unknown) => void) => {
      listener = cb
      return { dispose() {} }
    }
  }
  const doc = new DocController(api as never)
  return { doc, fire: (event: object) => listener?.(event) }
}

const MUTATION = CommandType.MUTATION

beforeEach(() => {
  vi.stubGlobal('window', { exelmj: { setDirty: vi.fn(), clearAutosave: vi.fn() } })
  vi.stubGlobal('document', { title: '' })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('sheet unsaved flag', () => {
  it('stays clean when recalculated formula values are written back into the cells', () => {
    const { doc, fire } = controllerWithEvents()
    // What Univer's CalculateResultApplyController executes after every
    // calculation — the first one after launch lands well after the load
    // window, which used to star a file the user had not touched.
    fire({
      id: 'sheet.mutation.set-range-values',
      type: MUTATION,
      params: { unitId: 'u', subUnitId: 's', cellValue: { 3: { 0: { v: 12 } } } },
      options: { onlyLocal: true, fromFormula: true, applyFormulaCalculationResult: true }
    })
    expect(doc.isDirty).toBe(false)
    expect(document.title.startsWith('* ')).toBe(false)
  })

  it('stays clean for the formula engine\'s own cell bookkeeping (flagged fromFormula)', () => {
    const { doc, fire } = controllerWithEvents()
    fire({ id: 'sheet.mutation.set-range-values', type: MUTATION, params: {}, options: { onlyLocal: true, fromFormula: true } })
    expect(doc.isDirty).toBe(false)
  })

  it('still turns unsaved on a real cell edit', () => {
    const { doc, fire } = controllerWithEvents()
    fire({ id: 'sheet.mutation.set-range-values', type: MUTATION, params: { unitId: 'u', subUnitId: 's', cellValue: {} } })
    expect(doc.isDirty).toBe(true)
    expect(document.title.startsWith('* ')).toBe(true)
    expect(window.exelmj?.setDirty).toHaveBeenLastCalledWith(true)
  })

  it('ignores formula.* and cell-editor doc.* mutations, and anything that is not a mutation', () => {
    const { doc, fire } = controllerWithEvents()
    fire({ id: 'formula.mutation.set-formula-calculation-result', type: MUTATION, params: {} })
    fire({ id: 'doc.mutation.rich-text-editing', type: MUTATION, params: {} })
    fire({ id: 'sheet.operation.set-selections', type: CommandType.OPERATION, params: {} })
    fire({ id: 'sheet.command.set-range-values', type: CommandType.COMMAND, params: {} })
    expect(doc.isDirty).toBe(false)
  })
})
