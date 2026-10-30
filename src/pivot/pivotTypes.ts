// App-native pivot tables (Univer's own pivot is Pro-only — forbidden).
// A PivotDef references its SOURCE data (sheet + A1 range whose first row is
// headers) and the TARGET sheet the computed table is written into. Field
// references are 0-based column offsets WITHIN the range, so renaming a
// header never breaks the definition.
export type PivotAgg = 'sum' | 'count' | 'average' | 'min' | 'max'

export interface PivotDef {
  id: string
  /** Target sheet display name (also the pivot's user-facing name). */
  name: string
  sourceSheetId: string
  /** A1 range on the source sheet, first row = headers. */
  range: string
  /** 0-based offset inside the range: the field grouped into ROWS. */
  rowField: number
  /** 0-based offset for the COLUMNS field, or null for a flat pivot. */
  colField: number | null
  /** 0-based offset of the aggregated VALUES field. */
  valueField: number
  agg: PivotAgg
  targetSheetId: string
}
