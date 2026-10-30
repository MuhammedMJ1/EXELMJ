// The only place Univer is configured. Registers the 8 free OSS presets.
// FORBIDDEN: preset-sheets-advanced / any @univerjs-pro package (license-gated,
// adds a watermark + export caps) — see PROJECT_MAP.md [TECH_STACK].
import { createUniver, ICommandService, LocaleType, mergeLocales, type FUniver, type Univer } from '@univerjs/presets'
import {
  SetWorksheetRightToLeftCommand,
  SetWorksheetRightToLeftMutation,
  UniverSheetsCorePreset
} from '@univerjs/presets/preset-sheets-core'
import UniverPresetSheetsCoreEnUS from '@univerjs/presets/preset-sheets-core/locales/en-US'
import UniverPresetSheetsCoreArSA from '@univerjs/presets/preset-sheets-core/locales/ar-SA'
import { UniverSheetsSortPreset } from '@univerjs/presets/preset-sheets-sort'
import UniverPresetSheetsSortEnUS from '@univerjs/presets/preset-sheets-sort/locales/en-US'
import UniverPresetSheetsSortArSA from '@univerjs/presets/preset-sheets-sort/locales/ar-SA'
import { UniverSheetsFilterPreset } from '@univerjs/presets/preset-sheets-filter'
import UniverPresetSheetsFilterEnUS from '@univerjs/presets/preset-sheets-filter/locales/en-US'
import UniverPresetSheetsFilterArSA from '@univerjs/presets/preset-sheets-filter/locales/ar-SA'
import { UniverSheetsFindReplacePreset } from '@univerjs/presets/preset-sheets-find-replace'
import UniverPresetSheetsFindReplaceEnUS from '@univerjs/presets/preset-sheets-find-replace/locales/en-US'
import UniverPresetSheetsFindReplaceArSA from '@univerjs/presets/preset-sheets-find-replace/locales/ar-SA'
import { UniverSheetsConditionalFormattingPreset } from '@univerjs/presets/preset-sheets-conditional-formatting'
import UniverPresetSheetsConditionalFormattingEnUS from '@univerjs/presets/preset-sheets-conditional-formatting/locales/en-US'
import UniverPresetSheetsConditionalFormattingArSA from '@univerjs/presets/preset-sheets-conditional-formatting/locales/ar-SA'
import { UniverSheetsDataValidationPreset } from '@univerjs/presets/preset-sheets-data-validation'
import UniverPresetSheetsDataValidationEnUS from '@univerjs/presets/preset-sheets-data-validation/locales/en-US'
import UniverPresetSheetsDataValidationArSA from '@univerjs/presets/preset-sheets-data-validation/locales/ar-SA'
import { UniverSheetsHyperLinkPreset } from '@univerjs/presets/preset-sheets-hyper-link'
import UniverPresetSheetsHyperLinkEnUS from '@univerjs/presets/preset-sheets-hyper-link/locales/en-US'
import UniverPresetSheetsHyperLinkArSA from '@univerjs/presets/preset-sheets-hyper-link/locales/ar-SA'
import { UniverSheetsDrawingPreset } from '@univerjs/presets/preset-sheets-drawing'
import UniverPresetSheetsDrawingEnUS from '@univerjs/presets/preset-sheets-drawing/locales/en-US'
import UniverPresetSheetsDrawingArSA from '@univerjs/presets/preset-sheets-drawing/locales/ar-SA'
import { UniverSheetsThreadCommentPreset } from '@univerjs/presets/preset-sheets-thread-comment'
import UniverPresetSheetsThreadCommentEnUS from '@univerjs/presets/preset-sheets-thread-comment/locales/en-US'
import UniverPresetSheetsThreadCommentArSA from '@univerjs/presets/preset-sheets-thread-comment/locales/ar-SA'
import { UniverSheetsNotePreset } from '@univerjs/presets/preset-sheets-note'
import UniverPresetSheetsNoteEnUS from '@univerjs/presets/preset-sheets-note/locales/en-US'
import UniverPresetSheetsNoteArSA from '@univerjs/presets/preset-sheets-note/locales/ar-SA'
import '@univerjs/presets/lib/styles/preset-sheets-core.css'
import '@univerjs/presets/lib/styles/preset-sheets-sort.css'
import '@univerjs/presets/lib/styles/preset-sheets-filter.css'
import '@univerjs/presets/lib/styles/preset-sheets-find-replace.css'
import '@univerjs/presets/lib/styles/preset-sheets-conditional-formatting.css'
import '@univerjs/presets/lib/styles/preset-sheets-data-validation.css'
import '@univerjs/presets/lib/styles/preset-sheets-hyper-link.css'
import '@univerjs/presets/lib/styles/preset-sheets-drawing.css'
import '@univerjs/presets/lib/styles/preset-sheets-thread-comment.css'
import '@univerjs/presets/lib/styles/preset-sheets-note.css'
import type { Lang } from '../i18n/i18n'

export function setupUniver(
  container: string,
  lang: Lang,
  systemFonts: string[] = []
): { univer: Univer; univerAPI: FUniver } {
  const result = createUniver({
    locale: lang === 'ar' ? LocaleType.AR_SA : LocaleType.EN_US,
    locales: {
      [LocaleType.EN_US]: mergeLocales(
        UniverPresetSheetsCoreEnUS,
        UniverPresetSheetsSortEnUS,
        UniverPresetSheetsFilterEnUS,
        UniverPresetSheetsFindReplaceEnUS,
        UniverPresetSheetsConditionalFormattingEnUS,
        UniverPresetSheetsDataValidationEnUS,
        UniverPresetSheetsHyperLinkEnUS,
        UniverPresetSheetsDrawingEnUS,
        UniverPresetSheetsThreadCommentEnUS,
        UniverPresetSheetsNoteEnUS
      ),
      [LocaleType.AR_SA]: mergeLocales(
        UniverPresetSheetsCoreArSA,
        UniverPresetSheetsSortArSA,
        UniverPresetSheetsFilterArSA,
        UniverPresetSheetsFindReplaceArSA,
        UniverPresetSheetsConditionalFormattingArSA,
        UniverPresetSheetsDataValidationArSA,
        UniverPresetSheetsHyperLinkArSA,
        UniverPresetSheetsDrawingArSA,
        UniverPresetSheetsThreadCommentArSA,
        UniverPresetSheetsNoteArSA
      )
    },
    presets: [
      UniverSheetsCorePreset({
        container,
        // Installed system fonts (queryLocalFonts, cached in settings.json)
        ...(systemFonts.length
          ? {
              customFontFamily: {
                override: false,
                list: systemFonts.slice(0, 300).map((f) => ({ value: f, label: f }))
              }
            }
          : {})
      }),
      UniverSheetsSortPreset(),
      UniverSheetsFilterPreset(),
      UniverSheetsFindReplacePreset(),
      UniverSheetsConditionalFormattingPreset(),
      UniverSheetsDataValidationPreset(),
      UniverSheetsHyperLinkPreset(),
      UniverSheetsDrawingPreset(),
      UniverSheetsThreadCommentPreset(),
      UniverSheetsNotePreset()
    ]
  })

  // The font-family dropdown previews every entry in its own font: with ~300
  // installed fonts Windows realizes hundreds of font files on first open and
  // the popup hangs. content-visibility skips render (and font realization)
  // for off-screen rows, so the list opens instantly and loads as you scroll.
  if (systemFonts.length && !document.getElementById('exelmj-fontlist-style')) {
    const style = document.createElement('style')
    style.id = 'exelmj-fontlist-style'
    style.textContent =
      '[class*="univer-"] button[style*="font-family"]{content-visibility:auto;contain-intrinsic-size:auto 28px;}'
    document.head.append(style)
  }

  // Univer 0.25.1 ships SetWorksheetRightToLeft but never registers it (grid
  // RTL rendering is still upstream WIP). We register it ourselves so the flag
  // is togglable + persisted; exported files open correctly mirrored in Excel.
  try {
    const injector = (result.univer as unknown as { __getInjector(): { get(token: unknown): unknown } }).__getInjector()
    const commandService = injector.get(ICommandService) as {
      registerCommand(cmd: unknown): unknown
    }
    commandService.registerCommand(SetWorksheetRightToLeftCommand)
    commandService.registerCommand(SetWorksheetRightToLeftMutation)
  } catch (err) {
    console.warn('[setup] RTL command registration failed', err)
  }

  return result
}
