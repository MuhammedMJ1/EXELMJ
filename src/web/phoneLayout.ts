// Phone layout for the web edition. The web build loads this (entry.ts); the
// desktop app never does. Everything sits under one media query, so tablets
// and wider screens keep the desktop layout.
//
// Under 768 px wide:
//   - Both pages start below a 40 px app bar that holds the mode pill, the
//     file name and the menu button (webShell builds it). Nothing of Univer's
//     header or the Word ribbon hides under the pill any more.
//   - Documents ribbon: its tab row and its groups get the full width, and the
//     groups scroll sideways with a finger. Their dropdowns (colours, styles,
//     table grid, the File panel) open as a sheet at the bottom of the screen,
//     because an overlay inside a sideways-scrolling strip would be clipped.
//     Buttons get touch size.
//   - Documents page: the text reflows to the screen width with small margins,
//     like Word's mobile view. Only the DISPLAY changes — the document's page
//     setup, printing and the saved .docx keep the real paper and margins.
//     Page-break guides and the comment gutter (a side strip a phone has no
//     room for) are hidden; commented words stay highlighted, and every
//     comment stays in the file.

export const PHONE_MAX_WIDTH = 767
export const APP_BAR_HEIGHT = 40

export function installPhoneLayout() {
  if (document.getElementById('exelmj-phone-layout')) return
  const style = document.createElement('style')
  style.id = 'exelmj-phone-layout'
  style.textContent = `
@media (max-width: ${PHONE_MAX_WIDTH}px) {
  #app { box-sizing: border-box; padding-top: ${APP_BAR_HEIGHT}px; }
  #word-app { top: ${APP_BAR_HEIGHT}px !important; }

  /* --- Sheets: Univer's ribbon toolbar and its "more" popup, sized for a
     finger. Univer moves whatever no longer fits into "more" by itself. --- */
  #app header > .univer-h-10 { height: 46px; }
  #app header [role="toolbar"] { height: 38px; align-items: center; }
  #app header [role="toolbar"] button,
  [data-radix-popper-content-wrapper] button[data-u-command] {
    height: 36px !important; min-width: 36px !important;
  }

  /* --- Documents: ribbon --- */
  #word-app .exelmj-ribbon .rb-tabs {
    padding-inline-start: 8px; padding-inline-end: 8px;
    overflow-x: auto; scrollbar-width: none;
  }
  #word-app .rb-body {
    overflow-x: auto; overscroll-behavior-x: contain; scrollbar-width: none;
    min-height: 0; padding: 4px 6px 2px;
  }
  #word-app .rb-tabs::-webkit-scrollbar, #word-app .rb-body::-webkit-scrollbar { display: none; }
  #word-app .rb-pane { flex: none; }
  #word-app .rb-btn { min-width: 40px; height: 40px; }
  #word-app .rb-btn-sm { min-width: 38px; height: 38px; }
  #word-app .rb-row-tall .rb-btn { height: 56px; width: 56px; }
  #word-app .rb-font { width: 118px; }
  #word-app .rb-font, #word-app .rb-size { height: 34px; font-size: 14px; }
  #word-app .rb-colormenu, #word-app .rb-menu, #word-app .rb-grid, #word-app .rb-filepanel {
    position: fixed !important; inset: auto 8px 8px 8px !important; width: auto !important;
    max-height: 55vh; overflow-y: auto; z-index: 3000; border-radius: 14px;
    box-shadow: 0 -6px 28px rgba(16, 24, 40, 0.25);
  }
  #word-app .rb-colorgrid { gap: 6px; }
  #word-app .rb-swatch { width: 100%; height: 30px; }
  #word-app .rb-menu button, #word-app .rb-fileitem { min-height: 44px; font-size: 15px; }
  #word-app .rb-grid-cells { grid-template-columns: repeat(10, 26px); grid-auto-rows: 26px; justify-content: center; }

  /* --- Documents: the page reflows to the screen --- */
  #exelmj-word-stage { width: auto !important; padding-inline-end: 0 !important; }
  #exelmj-word-page { width: auto !important; min-height: 0 !important; margin: 8px !important; }
  #word-app .exelmj-word-editor {
    min-height: calc(100dvh - 210px) !important; padding: 16px 14px !important;
  }
  #word-app .exelmj-page-guides, #exelmj-comment-pane { display: none !important; }
  #exelmj-word-status { font-size: 11px; padding: 2px 8px; }
}
`
  document.head.append(style)
}
