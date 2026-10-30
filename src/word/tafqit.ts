// Numbers written out in Arabic words — تفقيط — for quotations, invoices and
// cheques, where the amount has to appear twice: once in digits and once in
// words that cannot be altered afterwards.
//
// The conversion itself is a port of Mohsen Alyafei's `tafqit` (MIT, v1.60,
// https://github.com/MohsenAlyafei/tafqit): the counted-noun grammar is the
// hard part — ريال / ريالان / ريالات / ريالاً all appear depending on the
// number in front of them, and getting it wrong is what makes a written amount
// look forged. The port keeps the original algorithm; the currency table and
// the amount wrapper below are ours.

const SCALES = ['', 'ألف', 'مليون', 'مليار', 'ترليون', 'كوادرليون', 'كوينتليون', 'سكستليون']
const SCALES_PLURAL = ['', 'آلاف', 'ملايين', 'مليارات']
const MALE = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة', 'عشرة']
const FEMALE = ['', 'واحدة', 'اثنتان', 'ثلاث', 'أربع', 'خمس', 'ست', 'سبع', 'ثمان', 'تسع', 'عشر']

export interface TafqitOptions {
  /** The counted thing is feminine (تفاحة, هللة) — changes three to ten. */
  feminine?: boolean
  /** مئة instead of مائة. */
  miah?: boolean
  /** بليون instead of مليار. */
  billions?: boolean
  /** Something follows the number, so 200/2000 lose their nun (مئتا, ألفا). */
  textToFollow?: boolean
  /** Accusative/genitive case (جر/نصب) instead of nominative. */
  accusative?: boolean
  /** Split the hundreds word: ثلاث مائة instead of ثلاثمائة. */
  splitHundred?: boolean
  /** The legal wording used on cheques. */
  legal?: boolean
  /** [singular, dual, plural, singular-with-tanween] — the counted noun. */
  subject?: [string, string, string, string]
}

/** A whole number (any digit shape) → Arabic words. */
export function tafqit(value: number | string, options: TafqitOptions = {}): string {
  const { feminine, miah, billions, accusative, splitHundred, legal, subject } = options
  let textToFollow = !!options.textToFollow
  if (String(value) === '0' || Number(value) === 0) return 'صفر'

  const spWa = ' و'
  const tanween = 'ًا'
  const ahad = 'أحد'
  const ehda = 'إحدى'
  const taa = accusative ? 'تي' : 'تا'
  const taan = accusative ? 'تين' : 'تان'
  const aa = accusative ? 'ي' : 'ا'
  const aan = accusative ? 'ين' : 'ان'
  const ethna = accusative ? 'اثني' : 'اثنا'
  const ethnata = accusative ? 'اثنتي' : 'اثنتا'
  const ethnan = accusative ? 'اثنين' : 'اثنان'
  const ethnatan = accusative ? 'اثنتين' : 'اثنتان'
  const woon = accusative ? 'ين' : 'ون'
  const hasSubject = Array.isArray(subject) && subject.length === 4
  if (hasSubject) textToFollow = true

  // Arabic-Indic digits are what an Arabic office types; normalise first
  let digitsIn = String(value).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
  const hundredWord = miah ? 'مئة' : 'مائة'

  let units = [...MALE]
  let teens = [...MALE]
  teens[0] = FEMALE[10]
  teens[1] = ahad
  teens[2] = ethna
  units[2] = ethnan

  digitsIn = '0'.repeat(((digitsIn.length * 2) % 3)) + digitsIn
  const length = digitsIn.length

  let words = ''
  let triplet = 0
  let scalePos = 0
  let scale = ''
  let lastEffective = false
  let num99 = 0

  /** One group of three digits (1-999) in words, with its scale name. */
  const tripletToWords = (): string => {
    num99 = triplet % 100
    const num100 = ~~(triplet / 100)
    const unit = num99 % 10
    const tens = ~~(num99 / 10)
    let word100 = ''
    let word99 = ''

    if (feminine && !scale) {
      units = [...FEMALE]
      teens = [...FEMALE]
      teens[0] = MALE[10]
      teens[1] = ehda
      teens[2] = ethnata
      units[2] = ethnatan
      if (num99 > 19) units[1] = ehda
    }

    if (num100) {
      if (num100 > 2) word100 = FEMALE[num100] + (splitHundred ? ' ' : '') + hundredWord
      else if (num100 === 1) word100 = hundredWord
      // مائتا only in the construct state — when the counted noun follows the
      // hundred directly. With tens after it ("ومائتان وخمسون") the nun stays:
      // upstream drops it whenever anything follows the whole number at all.
      else word100 = hundredWord.slice(0, -1) + (!num99 && (scale || textToFollow) ? taa : taan)
    }

    if (num99 > 19) {
      word99 = units[unit] + (unit ? spWa : '') + (tens === 2 ? 'عشر' : FEMALE[tens]) + woon
    } else if (num99 > 10) {
      word99 = teens[num99 - 10] + ' ' + teens[0]
    } else if (num99 > 2 || !num99 || !hasSubject) {
      word99 = units[num99]
    }

    let out = word100 + (num100 && num99 ? spWa : '') + word99
    if (!scale) return out

    const scalePlural = scalePos < 4 ? SCALES_PLURAL[scalePos] : SCALES[scalePos] + 'ات'
    const legalText = legal && num99 < 3 ? ' ' + scale : ''
    const word100Wa = (num100 ? word100 + legalText + spWa : '') + scale
    if (num99 > 2) {
      out += ' ' + (num99 > 10 ? scale + (lastEffective && textToFollow ? '' : tanween) : scalePlural)
    } else if (!num99) {
      out += ' ' + scale
    } else if (num99 === 1) {
      out = word100Wa
    } else {
      out = word100Wa + (lastEffective && textToFollow ? aa : aan)
    }
    return out
  }

  for (let digits = length; digits > 0; digits -= 3) {
    const start = length - digits
    triplet = +digitsIn.slice(start, start + 3)
    lastEffective = !+digitsIn.slice(start + 3)
    if (!triplet) continue
    scalePos = digits / 3 - 1
    scale = SCALES[scalePos]
    if (billions && scalePos === 3) scale = 'بليون'
    words += tripletToWords()
    if (!lastEffective) words += spWa
  }

  if (!hasSubject) return words
  // the counted noun agrees with the last two digits, not with the whole number
  const space = !lastEffective ? '' : ' '
  const tail = +String(triplet).slice(-2)
  if (tail > 10) return words + space + subject![3]
  if (tail > 2) return words + space + subject![2]
  if (tail > 0) return words + subject![tail - 1] + ' ' + units[num99]
  return words + space + subject![0]
}

/** The four forms a currency name takes, plus its subunit. */
export interface Currency {
  code: string
  label: string
  major: [string, string, string, string]
  minor: [string, string, string, string]
  /** Feminine subunit (هللة) — changes three to ten. */
  minorFeminine: boolean
  /** How many subunits make one: 100 for هللة, 1000 for فلس. */
  minorPer: number
}

export const CURRENCIES: Currency[] = [
  {
    code: 'IQD',
    label: 'دينار عراقي',
    major: ['دينار', 'ديناران', 'دنانير', 'ديناراً'],
    minor: ['فلس', 'فلسان', 'فلوس', 'فلساً'],
    minorFeminine: false,
    minorPer: 1000
  },
  {
    code: 'SAR',
    label: 'ريال سعودي',
    major: ['ريال', 'ريالان', 'ريالات', 'ريالاً'],
    minor: ['هللة', 'هللتان', 'هللات', 'هللةً'],
    minorFeminine: true,
    minorPer: 100
  },
  {
    code: 'AED',
    label: 'درهم إماراتي',
    major: ['درهم', 'درهمان', 'دراهم', 'درهماً'],
    minor: ['فلس', 'فلسان', 'فلوس', 'فلساً'],
    minorFeminine: false,
    minorPer: 100
  },
  {
    code: 'KWD',
    label: 'دينار كويتي',
    major: ['دينار', 'ديناران', 'دنانير', 'ديناراً'],
    minor: ['فلس', 'فلسان', 'فلوس', 'فلساً'],
    minorFeminine: false,
    minorPer: 1000
  },
  {
    code: 'EGP',
    label: 'جنيه مصري',
    major: ['جنيه', 'جنيهان', 'جنيهات', 'جنيهاً'],
    minor: ['قرش', 'قرشان', 'قروش', 'قرشاً'],
    minorFeminine: false,
    minorPer: 100
  },
  {
    code: 'USD',
    label: 'دولار أمريكي',
    major: ['دولار', 'دولاران', 'دولارات', 'دولاراً'],
    minor: ['سنت', 'سنتان', 'سنتات', 'سنتاً'],
    minorFeminine: false,
    minorPer: 100
  },
  {
    code: 'EUR',
    label: 'يورو',
    major: ['يورو', 'يوروان', 'يوروات', 'يورو'],
    minor: ['سنت', 'سنتان', 'سنتات', 'سنتاً'],
    minorFeminine: false,
    minorPer: 100
  }
]

export function currencyByCode(code: string): Currency | undefined {
  return CURRENCIES.find((c) => c.code === code)
}

export interface AmountOptions {
  /** Currency code from CURRENCIES; omitted means a bare number. */
  currency?: string
  /** Wrap in فقط … لا غير, the way a cheque is written. Default true. */
  legalWrap?: boolean
  /** مئة instead of مائة. */
  miah?: boolean
}

/**
 * An amount → the sentence that goes on the cheque line.
 * 1250.75 SAR → "فقط ألف ومئتان وخمسون ريالاً وخمس وسبعون هللة لا غير".
 */
export function amountInWords(value: number | string, options: AmountOptions = {}): string {
  const { currency, miah } = options
  const legalWrap = options.legalWrap !== false
  const cur = currency ? currencyByCode(currency) : undefined
  const raw = String(value)
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/٫/g, '.')
    .replace(/[٬,\s]/g, '')
  const negative = /^-/.test(raw)
  const numeric = Math.abs(Number(raw))
  if (!Number.isFinite(numeric)) return ''

  const per = cur?.minorPer ?? 100
  // round on the subunit, or 1250.005 quietly becomes 1250.00
  const totalMinor = Math.round(numeric * per)
  const major = Math.floor(totalMinor / per)
  const minor = totalMinor % per

  const majorWords = cur
    ? tafqit(major, { subject: cur.major, miah })
    : tafqit(major, { miah })
  const minorWords =
    minor && cur
      ? tafqit(minor, { subject: cur.minor, feminine: cur.minorFeminine, miah })
      : minor
        ? tafqit(minor, { miah })
        : ''

  let text = major || !minor ? majorWords : ''
  if (minorWords) text = text ? `${text} و${minorWords}` : minorWords
  if (negative) text = `سالب ${text}`
  return legalWrap ? `فقط ${text} لا غير` : text
}
