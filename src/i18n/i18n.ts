import en from './en.json'
import ar from './ar.json'

export type Lang = 'en' | 'ar'

const tables: Record<Lang, Record<string, string>> = { en, ar }

let current: Lang = 'en'

export function initI18n(lang: Lang) {
  current = lang
  document.documentElement.lang = lang
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
}

export const getLang = () => current

export const t = (key: string) => tables[current][key] ?? tables.en[key] ?? key
