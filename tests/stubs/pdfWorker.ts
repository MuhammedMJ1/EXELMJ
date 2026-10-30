// Vite turns `?worker&inline` into a Worker constructor; node has no such
// loader, so the tests swap in this stub. Nothing here is ever constructed —
// the PDF layer's pure functions (run merging, geometry) are what get tested.
export default class StubWorker {
  terminate(): void {}
}
