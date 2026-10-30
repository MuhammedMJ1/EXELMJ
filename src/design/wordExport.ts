// AI/PDF → editable WORD converter (the manager's client workflow: designs
// arrive as .ai, clients need .docx they can retype).
//
// Recipe: the artwork page becomes a full-page image placed BEHIND the text
// (its own printed runs already wiped with sampled-background patches by the
// caller), and every detected text run becomes a Word PARAGRAPH FRAME —
// absolutely positioned at the same pt coordinates (Word frames use twips,
// 1pt = 20 twips) — so the document opens in Word looking like the design,
// with every line directly editable.
import {
  AlignmentType,
  Document,
  FrameAnchorType,
  ImageRun,
  Packer,
  Paragraph,
  TextRun
} from 'docx'
import { boxCoveringRun, type TextBox } from './overlayModel'

export interface WordRun {
  text: string
  dir: 'rtl' | 'ltr'
  /** left edge, pt */
  x: number
  /** top edge, pt */
  y: number
  width: number
  size: number
  color: string
}

export interface DesignWordInput {
  pageWidthPt: number
  pageHeightPt: number
  /** page raster with the original text already patched out */
  backgroundPng: Uint8Array
  runs: WordRun[]
  boxes: TextBox[]
}

const TWIPS = 20 // per pt
const EMU_PER_PT = 12700

export async function buildDesignWord(input: DesignWordInput): Promise<Uint8Array> {
  const children: Paragraph[] = []

  // full-page background, behind the text
  children.push(
    new Paragraph({
      children: [
        new ImageRun({
          type: 'png',
          data: input.backgroundPng.slice(),
          transformation: {
            width: (input.pageWidthPt * 96) / 72,
            height: (input.pageHeightPt * 96) / 72
          },
          floating: {
            behindDocument: true,
            zIndex: 0,
            horizontalPosition: { relative: 'page', offset: 0 },
            verticalPosition: { relative: 'page', offset: 0 },
            allowOverlap: true,
            lockAnchor: true
          }
        })
      ]
    })
  )

  const frame = (run: WordRun): Paragraph => {
    const rtl = run.dir === 'rtl'
    const half = Math.max(2, Math.round(run.size * 2))
    return new Paragraph({
      frame: {
        type: 'absolute',
        position: { x: Math.round((run.x - 2) * TWIPS), y: Math.round((run.y - 1) * TWIPS) },
        width: Math.round((run.width + 8) * TWIPS),
        height: Math.round(run.size * 1.5 * TWIPS),
        anchor: { horizontal: FrameAnchorType.PAGE, vertical: FrameAnchorType.PAGE }
      },
      bidirectional: rtl || undefined,
      alignment: rtl ? AlignmentType.START : AlignmentType.LEFT,
      children: [
        new TextRun({
          text: run.text,
          size: half,
          sizeComplexScript: half,
          color: run.color.replace('#', ''),
          rightToLeft: rtl || undefined,
          font: { ascii: 'Arial', hAnsi: 'Arial', cs: 'Arial' }
        })
      ]
    })
  }

  // a run the user replaced sits under that box's cover patch: the background
  // raster already hides it, so re-emitting its text would stack the original
  // on top of the replacement in Word
  for (const run of input.runs) {
    if (run.text.trim() && !boxCoveringRun(input.boxes, run)) children.push(frame(run))
  }
  // the user's own overlay boxes ride along as editable frames too
  for (const box of input.boxes) {
    if (!box.text.trim()) continue
    const rtl = box.align === 'right'
    const width = box.width > 0 ? box.width : Math.max(40, box.text.length * box.sizePt * 0.62)
    for (const [i, line] of box.text.replace(/\r/g, '').split('\n').entries()) {
      children.push(
        frame({
          text: line,
          dir: rtl ? 'rtl' : 'ltr',
          x: rtl ? box.x - width : box.x,
          y: box.y + i * box.sizePt * 1.35,
          width,
          size: box.sizePt,
          color: box.color
        })
      )
    }
  }

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: { ascii: 'Arial', hAnsi: 'Arial', cs: 'Arial' }, size: 22, sizeComplexScript: 22 }
        }
      }
    },
    sections: [
      {
        properties: {
          page: {
            size: {
              width: Math.round(input.pageWidthPt * TWIPS),
              height: Math.round(input.pageHeightPt * TWIPS)
            },
            margin: { top: 0, bottom: 0, left: 0, right: 0 }
          }
        },
        children
      }
    ]
  })

  const base64 = await Packer.toBase64String(doc)
  if (typeof atob === 'function') {
    const bin = atob(base64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return bytes
  }
  return new Uint8Array(Buffer.from(base64, 'base64'))
}

export { EMU_PER_PT }
