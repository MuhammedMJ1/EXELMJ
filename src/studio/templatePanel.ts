// The templates panel: save a selection, browse the library, place an
// instance, and move templates in and out as files.
//
// A template is ONE self-contained JSON file (see template.ts). That decision
// shows up here: the library is a flat list with no index to rebuild, no
// database to migrate, and "import" is just reading a file somebody emailed.

import { t } from '../i18n/i18n'
import type { ComponentDef } from './model'
import { defSize, parseTemplate, serializeTemplate, templateFileName } from './template'

export interface TemplatePanelHost {
  /** Every definition in the open document. */
  templates(): ComponentDef[]
  /** Is there a selection worth saving? */
  hasSelection(): boolean
  /** Turn the current selection into a definition, or null if there is none. */
  saveSelection(name: string): ComponentDef | null
  /** Place an instance on the current artboard. */
  place(defId: string): boolean
  /** Remove a definition. Returns how many instances went with it. */
  remove(defId: string): number
  /** Add a definition read from a file. */
  add(def: ComponentDef): void
  saveFile(name: string, bytes: Uint8Array): void
  /** Ask the user for a template file and return its text. */
  openFile(): Promise<string | null>
  setStatus(message: string): void
  appVersion: string
}

export class TemplatePanel {
  private root: HTMLElement
  private list: HTMLElement
  private nameInput: HTMLInputElement

  constructor(
    parent: HTMLElement,
    private readonly host: TemplatePanelHost
  ) {
    this.root = document.createElement('section')
    this.root.className = 'dz-tplpanel'

    const title = document.createElement('h3')
    title.textContent = t('studioTemplates')
    this.root.append(title)

    const row = document.createElement('div')
    row.className = 'dz-cp-row'
    this.nameInput = document.createElement('input')
    this.nameInput.type = 'text'
    this.nameInput.className = 'dz-cp-hex'
    this.nameInput.placeholder = t('studioTplName')
    row.append(this.nameInput)
    row.append(this.button(t('studioTplSave'), () => this.saveSelection()))
    this.root.append(row)

    const io = document.createElement('div')
    io.className = 'dz-cp-actions'
    io.append(this.button(t('studioTplImport'), () => void this.importFile()))
    this.root.append(io)

    this.list = document.createElement('div')
    this.list.className = 'dz-tpl-list'
    this.root.append(this.list)

    parent.append(this.root)
    this.refresh()
  }

  destroy(): void {
    this.root.remove()
  }

  private button(label: string, run: () => void): HTMLElement {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'dz-btn'
    b.textContent = label
    b.addEventListener('click', run)
    return b
  }

  refresh(): void {
    this.list.innerHTML = ''
    const defs = this.host.templates()
    if (!defs.length) {
      const empty = document.createElement('div')
      empty.className = 'dz-icon-note'
      empty.textContent = t('studioTplEmpty')
      this.list.append(empty)
      return
    }
    for (const def of defs) {
      const row = document.createElement('div')
      row.className = 'dz-tpl-row'

      const label = document.createElement('button')
      label.type = 'button'
      label.className = 'dz-tpl-name'
      const size = defSize(def)
      label.innerHTML = `<span>${escapeText(def.name)}</span><small dir="ltr">${Math.round(size.w)}×${Math.round(size.h)} pt</small>`
      label.title = t('studioTplPlace')
      label.addEventListener('click', () => {
        const ok = this.host.place(def.id)
        this.host.setStatus(ok ? t('studioTplPlaced').replace('{name}', def.name) : t('studioTplPlaceFailed'))
      })
      row.append(label)

      row.append(
        this.iconButton('↓', t('studioTplExport'), () => {
          this.host.saveFile(
            templateFileName(def.name),
            new TextEncoder().encode(serializeTemplate(def, this.host.appVersion))
          )
        })
      )
      row.append(
        this.iconButton('×', t('studioTplRemove'), () => {
          const n = this.host.remove(def.id)
          // Saying how many instances went with it is the difference between a
          // delete the user understands and one they discover later.
          this.host.setStatus(
            n ? t('studioTplRemovedWith').replace('{n}', String(n)) : t('studioTplRemoved')
          )
          this.refresh()
        })
      )
      this.list.append(row)
    }
  }

  private iconButton(glyph: string, title: string, run: () => void): HTMLElement {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'dz-tpl-act'
    b.textContent = glyph
    b.title = title
    b.addEventListener('click', run)
    return b
  }

  private saveSelection(): void {
    if (!this.host.hasSelection()) {
      this.host.setStatus(t('studioTplNoSelection'))
      return
    }
    const name = this.nameInput.value.trim() || t('studioTplUntitled')
    const def = this.host.saveSelection(name)
    if (!def) {
      this.host.setStatus(t('studioTplNoSelection'))
      return
    }
    this.nameInput.value = ''
    this.refresh()
    this.host.setStatus(t('studioTplSaved').replace('{name}', def.name))
  }

  private async importFile(): Promise<void> {
    const text = await this.host.openFile()
    if (!text) return
    const def = parseTemplate(text)
    if (!def) {
      // parseTemplate validates with the same cleaners the sidecar uses, so a
      // refusal means the file is genuinely unusable, not merely unfamiliar.
      this.host.setStatus(t('studioTplBadFile'))
      return
    }
    this.host.add(def)
    this.refresh()
    this.host.setStatus(t('studioTplImported').replace('{name}', def.name))
  }
}

/** A template name comes from a file somebody else wrote. */
function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
