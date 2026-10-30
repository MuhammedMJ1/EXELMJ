export type ChartKind = 'bar' | 'line' | 'area' | 'pie'

export interface ChartDef {
  id: string
  kind: ChartKind
  /** Univer sheet id the data range lives in. */
  sheetId: string
  /** A1 notation, e.g. 'A1:B5'. */
  range: string
  title: string
  /** Position/size in px on the sheet canvas (float-DOM coordinates). */
  x: number
  y: number
  w: number
  h: number
}
