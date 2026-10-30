/// <reference lib="webworker" />
// The worker end of the tracing protocol. See traceWorker.ts for the client
// and for why this exists at all.
//
// This file deliberately contains no algorithm: it unpacks a message, calls
// the SAME traceImage() the synchronous path calls, and posts results back.
// That is what makes "output is byte-identical to the synchronous path" true
// by construction rather than by testing two implementations against each
// other.

import { traceImage, type TracedPath } from './trace'
import type { WorkerRequest, WorkerResponse } from './traceWorker'

/** Jobs the client asked to stop. Checked between layers. */
const cancelled = new Set<number>()

const post = (msg: WorkerResponse, transfer: Transferable[] = []): void => {
  ;(self as unknown as DedicatedWorkerGlobalScope).postMessage(msg, transfer)
}

self.addEventListener('message', (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data
  if (msg.kind === 'cancel') {
    cancelled.add(msg.jobId)
    return
  }
  if (msg.kind !== 'trace') return

  const { jobId, width, height, pixels, options } = msg
  // A cancel that arrived BEFORE the trace started (the user clicked twice
  // quickly) must not run the trace at all.
  if (cancelled.has(jobId)) {
    cancelled.delete(jobId)
    post({ kind: 'cancelled', jobId })
    return
  }

  const data = new Uint8ClampedArray(pixels)
  // Layers already sent, so a late subscriber (or the final message) never
  // re-sends geometry the client is already drawing.
  let sent = 0
  const emitted: TracedPath[] = []

  try {
    const paths = traceImage(data, width, height, {
      ...options,
      // The callback is supplied HERE, not by the client: a function cannot
      // cross postMessage, so the protocol carries plain options only.
      onLayer: (done, total, path) => {
        if (path) emitted.push(path)
        post({
          kind: 'progress',
          jobId,
          // Layers are the expensive part; the palette work before them is
          // reported as the first 15% so the bar does not sit at zero through
          // the longest single step on a large image.
          value: 0.15 + 0.85 * (total ? done / total : 1),
          stage: 'fitting',
          paths: emitted.slice(sent)
        })
        sent = emitted.length
        // Returning false stops the pipeline and returns what it has. Checking
        // BETWEEN layers (rather than never) is what makes cancel land within
        // one layer instead of at the end of the whole image.
        if (cancelled.has(jobId)) return false
        return true
      }
    })
    if (cancelled.has(jobId)) {
      cancelled.delete(jobId)
      post({ kind: 'cancelled', jobId })
      return
    }
    post({ kind: 'done', jobId, paths })
  } catch (err) {
    post({ kind: 'failed', jobId, message: err instanceof Error ? err.message : String(err) })
  } finally {
    cancelled.delete(jobId)
  }
})
