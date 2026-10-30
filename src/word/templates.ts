// Ready-made documents for the work that actually comes up in an office:
// a letter that goes out on company paper, a quotation with a totals table, the
// minutes of a meeting, and an internal memo.
//
// Each template is plain editor HTML — the same shape the docx importer
// produces — so a template opens as an ordinary document with nothing special
// about it, and the date is filled in on the day it is used.
import { getLang, t } from '../i18n/i18n'

export interface DocTemplate {
  key: string
  label: string
  html: string
  /** paper the template expects; the rest comes from the current setup */
  landscape?: boolean
}

function today(): string {
  const now = new Date()
  try {
    return new Intl.DateTimeFormat(getLang() === 'ar' ? 'ar' : 'en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(now)
  } catch {
    return now.toISOString().slice(0, 10)
  }
}

const dir = () => (getLang() === 'ar' ? 'rtl' : 'ltr')
const align = () => (getLang() === 'ar' ? 'right' : 'left')

function p(text: string, extra = ''): string {
  return `<p dir="${dir()}" style="text-align: ${align()}${extra ? `; ${extra}` : ''}">${text}</p>`
}

function h(level: 1 | 2, text: string, centre = false): string {
  return `<h${level} dir="${dir()}" style="text-align: ${centre ? 'center' : align()}">${text}</h${level}>`
}

function row(cells: string[], header = false): string {
  const tag = header ? 'th' : 'td'
  return `<tr>${cells
    .map((cell) => `<${tag}><p dir="${dir()}" style="text-align: ${align()}">${cell}</p></${tag}>`)
    .join('')}</tr>`
}

export function documentTemplates(): DocTemplate[] {
  const date = today()
  return [
    {
      key: 'letter',
      label: t('tplLetter'),
      html: [
        h(1, t('tplLetterTitle'), true),
        p(`${t('tplDate')}: ${date}`),
        p(`${t('tplRef')}: ______`),
        p(''),
        p(`${t('tplTo')}: ______`),
        p(`${t('tplSubject')}: ______`),
        p(''),
        p(t('tplGreeting')),
        p(t('tplLetterBody')),
        p(''),
        p(t('tplClosing')),
        p(`${t('tplSignature')}: ______`),
        p(`${t('tplPosition')}: ______`)
      ].join('')
    },
    {
      key: 'quote',
      label: t('tplQuote'),
      html: [
        h(1, t('tplQuoteTitle'), true),
        p(`${t('tplDate')}: ${date}`),
        p(`${t('tplClient')}: ______`),
        p(''),
        `<table><tbody>${row([t('tplItem'), t('tplQty'), t('tplPrice'), t('tplTotal')], true)}${row([
          '______',
          '1',
          '0',
          '0'
        ])}${row(['______', '1', '0', '0'])}${row(['______', '1', '0', '0'])}${row([
          `<strong>${t('tplGrandTotal')}</strong>`,
          '',
          '',
          '<strong>0</strong>'
        ])}</tbody></table>`,
        p(''),
        p(t('tplQuoteNote')),
        p(`${t('tplSignature')}: ______`)
      ].join('')
    },
    {
      key: 'minutes',
      label: t('tplMinutes'),
      html: [
        h(1, t('tplMinutesTitle'), true),
        p(`${t('tplDate')}: ${date}`),
        p(`${t('tplPlace')}: ______`),
        p(`${t('tplAttendees')}: ______`),
        h(2, t('tplAgenda')),
        '<ol><li>' +
          `<p dir="${dir()}" style="text-align: ${align()}">______</p></li><li><p dir="${dir()}" style="text-align: ${align()}">______</p></li></ol>`,
        h(2, t('tplDecisions')),
        `<table><tbody>${row([t('tplDecision'), t('tplOwner'), t('tplDue')], true)}${row([
          '______',
          '______',
          '______'
        ])}${row(['______', '______', '______'])}</tbody></table>`,
        p(''),
        p(`${t('tplSignature')}: ______`)
      ].join('')
    },
    {
      key: 'memo',
      label: t('tplMemo'),
      html: [
        h(1, t('tplMemoTitle'), true),
        p(`${t('tplTo')}: ______`),
        p(`${t('tplFrom')}: ______`),
        p(`${t('tplDate')}: ${date}`),
        p(`${t('tplSubject')}: ______`),
        p(''),
        p(t('tplMemoBody')),
        p(''),
        p(`${t('tplSignature')}: ______`)
      ].join('')
    }
  ]
}
