// The tracing worker.
//
// Tracing a 4000x3000 image runs for several seconds of pure computation on
// the renderer thread, and until now that froze the window: no repaint, no
// cancel, no progress. The pipeline in trace.ts is already PURE (no DOM, no
// canvas — that is why it unit-tests in node), so it moves into a Worker
// unchanged. Nothing about the algorithm changes; only who runs it.
//
// The protocol is deliberately tiny and typed on both ends. Two rules make it
// safe:
//  1. Every message carries the JOB ID. A late result from a cancelled job
//     must be droppable, or a slow trace finishing after the user started a
//     new one silently overwrites the new artwork.
//  2. Pixels are TRANSFERRED, not copied. A 4000x3000 RGBA buffer is 48 MB;
//     structured-cloning it would cost more than some traces.

import type { TraceOptions, TracedPath } from './trace'

export interface TraceRequest {
  kind: 'trace'
  jobId: number
  width: number
  height: number
  /** transferred, so the sender must not touch it afterwards */
  pixels: ArrayBuffer
  options: TraceOptions
}

export interface CancelRequest {
  kind: 'cancel'
  jobId: number
}

export type WorkerRequest = TraceRequest | CancelRequest

export interface ProgressMessage {
  kind: 'progress'
  jobId: number
  /** 0..1 */
  value: number
  /** what the worker is doing, for the status line */
  stage: 'palette' | 'layers' | 'fitting'
  /** layers finished so far — the live preview draws these as they arrive */
  paths?: TracedPath[]
}

export interface DoneMessage {
  kind: 'done'
  jobId: number
  paths: TracedPath[]
}

export interface FailedMessage {
  kind: 'failed'
  jobId: number
  message: string
}

export interface CancelledMessage {
  kind: 'cancelled'
  jobId: number
}

export type WorkerResponse = ProgressMessage | DoneMessage | FailedMessage | CancelledMessage

/**
 * A running trace, from the caller's side.
 *
 * `cancel()` is cooperative: the worker checks between layers, so it returns
 * within one layer's work rather than instantly. That is the honest trade —
 * killing the worker outright would lose the layers already computed, which
 * are exactly what the live preview is showing.
 */
export interface TraceJob {
  readonly id: number
  cancel(): void
  readonly promise: Promise<TracedPath[]>
}

type ProgressHandler = (p: { value: number; stage: ProgressMessage['stage']; paths?: TracedPath[] }) => void

/**
 * Owns the Worker and multiplexes jobs onto it.
 *
 * One worker, not one per trace: spinning up a Worker costs tens of
 * milliseconds and a fresh module graph, and two concurrent traces would
 * compete for the same cores anyway. A new trace supersedes the old one.
 */
export class TraceClient {
  private worker: Worker | null = null
  private seq = 0
  private pending = new Map<
    number,
    {
      resolve: (p: TracedPath[]) => void
      reject: (e: Error) => void
      onProgress?: ProgressHandler
    }
  >()

  /** Lazily created: a user who never traces never pays for the worker. */
  private ensure(): Worker {
    if (this.worker) return this.worker
    // `new URL(..., import.meta.url)` is what lets Vite fingerprint and bundle
    // the worker as its own chunk; a bare string path breaks in the packaged
    // app, where the file is hashed.
    const w = new Worker(new URL('./trace.worker.ts', import.meta.url), { type: 'module' })
    w.addEventListener('message', (e: MessageEvent<WorkerResponse>) => this.onMessage(e.data))
    w.addEventListener('error', (e) => {
      // A worker-level error has no job id, so every pending job is suspect.
      for (const [, p] of this.pending) p.reject(new Error(e.message || 'worker error'))
      this.pending.clear()
    })
    this.worker = w
    return w
  }

  private onMessage(msg: WorkerResponse): void {
    const entry = this.pending.get(msg.jobId)
    // A message for an unknown job is a LATE result from a cancelled trace —
    // dropping it is the whole reason job ids exist.
    if (!entry) return
    if (msg.kind === 'progress') {
      entry.onProgress?.({ value: msg.value, stage: msg.stage, paths: msg.paths })
      return
    }
    this.pending.delete(msg.jobId)
    if (msg.kind === 'done') entry.resolve(msg.paths)
    else if (msg.kind === 'cancelled') entry.resolve([])
    else entry.reject(new Error(msg.message))
  }

  /**
   * Start a trace. `pixels` is TRANSFERRED — the caller must not read it
   * afterwards (it is detached), which is why callers pass a copy when they
   * still need the original.
   */
  trace(
    pixels: Uint8ClampedArray,
    width: number,
    height: number,
    options: TraceOptions,
    onProgress?: ProgressHandler
  ): TraceJob {
    const id = ++this.seq
    const w = this.ensure()
    const buffer = pixels.buffer.slice(
      pixels.byteOffset,
      pixels.byteOffset + pixels.byteLength
    ) as ArrayBuffer
    const promise = new Promise<TracedPath[]>((resolve, reject) => {
      this.pending.set(id, { resolve, reject, onProgress })
    })
    const req: TraceRequest = { kind: 'trace', jobId: id, width, height, pixels: buffer, options }
    w.postMessage(req, [buffer])
    return {
      id,
      cancel: () => {
        const cancel: CancelRequest = { kind: 'cancel', jobId: id }
        w.postMessage(cancel)
      },
      promise
    }
  }

  /** Drop the worker entirely — used when the design page unmounts. */
  destroy(): void {
    for (const [, p] of this.pending) p.reject(new Error('closed'))
    this.pending.clear()
    this.worker?.terminate()
    this.worker = null
  }
}
