import { describe, expect, it } from 'vitest'
import { swapHAlign } from '../src/univer/rtlAlign'
import { parseListOptions } from '../src/univer/rtlDropdown'

// HorizontalAlign in Univer: 1 = left, 2 = center, 3 = right.
describe('rtl alignment swap', () => {
  it('swaps explicit left and right so the mirror lands them where the file says', () => {
    expect(swapHAlign(1)).toBe(3)
    expect(swapHAlign(3)).toBe(1)
  })

  it('leaves center, justified and unset alignment to the mirror default', () => {
    expect(swapHAlign(2)).toBeUndefined()
    expect(swapHAlign(4)).toBeUndefined()
    expect(swapHAlign(0)).toBeUndefined()
    expect(swapHAlign(undefined)).toBeUndefined()
  })
})

describe('rtl dropdown options', () => {
  it('reads the JSON form Univer writes for a literal list', () => {
    expect(parseListOptions(JSON.stringify(['منجز', 'جاري', 'متأخر']))).toEqual([
      'منجز',
      'جاري',
      'متأخر'
    ])
  })

  it('reads the plain comma form used by hand-made rules', () => {
    expect(parseListOptions('منجز, جاري ,متأخر')).toEqual(['منجز', 'جاري', 'متأخر'])
  })

  it('returns nothing for a range-sourced list (resolved from the sheet instead)', () => {
    expect(parseListOptions('=مصادر!$A$1:$A$3')).toEqual([])
    expect(parseListOptions('')).toEqual([])
    expect(parseListOptions(undefined)).toEqual([])
  })
})
