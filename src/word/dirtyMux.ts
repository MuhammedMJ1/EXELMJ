// Main keeps ONE global dirty flag (the close-guard input). Two renderer
// documents feed it now — the sheet workbook and the word document — so this
// mux ORs the two before talking to the bridge. DocController reports through
// reportSheetDirty; the word module through reportWordDirty.
let sheetDirty = false
let wordDirty = false
let designDirty = false
let photoDirty = false

function push() {
  window.exelmj?.setDirty(sheetDirty || wordDirty || designDirty || photoDirty)
}

export function reportSheetDirty(dirty: boolean) {
  sheetDirty = dirty
  push()
}

export function reportWordDirty(dirty: boolean) {
  wordDirty = dirty
  push()
}

export function reportDesignDirty(dirty: boolean) {
  designDirty = dirty
  push()
}

export function isSheetDirty() {
  return sheetDirty
}

export function isWordDirty() {
  return wordDirty
}

export function isDesignDirty() {
  return designDirty
}

export function reportPhotoDirty(dirty: boolean) {
  photoDirty = dirty
  push()
}

export function isPhotoDirty() {
  return photoDirty
}
