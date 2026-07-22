const INVISIBLE_RE = /[\u0000-\u001F\u007F-\u009F\u00AD\u200B\u200C\u200D\u200E\u200F\u2028\u2029\u2060\uFEFF]/g;
const INVISIBLE_KEEP_WS_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u00AD\u200B\u200C\u200D\u200E\u200F\u2028\u2029\u2060\uFEFF]/g;

export function cleanInvisible(s: string): string {
  return String(s).replace(INVISIBLE_RE, '');
}

export function cleanInvisibleKeepWs(s: string): string {
  return String(s).replace(INVISIBLE_KEEP_WS_RE, '');
}

const DASH_RE = /[\u2010-\u2015\u2212\uFF0D\u007E\uFF5E]/g;

export function prepDateText(s: string): string {
  return cleanInvisible(String(s).normalize('NFKC')).replace(DASH_RE, '-');
}

export function normalizeDateString(s: string): string {
  let t = prepDateText(s);
  if (!/[A-Za-z]{3,}/.test(t)) {
    t = t.replace(/[Oo]/g, '0').replace(/[Il|]/g, '1').replace(/[Ss]/g, '5')
         .replace(/[Bb]/g, '8').replace(/[Zz]/g, '2').replace(/[Gg]/g, '6').replace(/[Qq]/g, '0');
  }
  return t;
}

export function normSp(s: string): string {
  return cleanInvisible(String(s).normalize('NFKC')).toLowerCase().replace(/[\s.:,;!?'"]+/g, '');
}

export function normToken(tok: string): string {
  let t = prepDateText(tok).trim();
  return t.replace(/[.,;:)\]]+$/, '').replace(/^[.]+/, '');
}

export function phraseIndex(text: string, needleNoWs: string, from: number = 0): number {
  if (!needleNoWs) return -1;
  const clean: Array<{ ch: string; idx: number }> = [];
  for (let i = from; i < text.length; i++) {
    const c = text[i];
    if (/\s/.test(c)) continue;
    clean.push({ ch: c.toLowerCase(), idx: i });
  }
  const flat = clean.map((x) => x.ch).join('');
  const p = flat.indexOf(needleNoWs);
  return p < 0 ? -1 : clean[p].idx;
}

export const MONTHS: Record<string, number> = {
  January: 1, February: 2, March: 3, April: 4, May: 5, June: 6,
  July: 7, August: 8, September: 9, October: 10, November: 11, December: 12,
};
const MONTH_ABBR: Record<string, number> = {
  Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
  Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
};
const MONTH_LOOKUP: Record<string, number> = {};
for (const [name, num] of Object.entries({ ...MONTHS, ...MONTH_ABBR })) {
  MONTH_LOOKUP[name.toLowerCase()] = num;
}
export function monthNum(s: string): number | null {
  return MONTH_LOOKUP[String(s).toLowerCase()] || null;
}

const MONTH_NAME_ALT = Object.keys(MONTHS).join('|');
const MONTH_ABBR_ALT = Object.keys(MONTH_ABBR).join('|');
export const MONTH_ALT = `${MONTH_NAME_ALT}|${MONTH_ABBR_ALT}`;

export function toIso(text: string): string | null {
  text = normalizeDateString(text).trim();

  let m = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  m = text.match(new RegExp(`^(\\d{1,2})\\s+(${MONTH_ALT})\\s+(\\d{4})$`, 'i'));
  if (m) return `${m[3]}-${String(monthNum(m[2])!).padStart(2, '0')}-${String(parseInt(m[1], 10)).padStart(2, '0')}`;

  m = text.match(new RegExp(`^(${MONTH_ALT})\\s+(\\d{1,2}),?\\s+(\\d{4})$`, 'i'));
  if (m) return `${m[3]}-${String(monthNum(m[1])!).padStart(2, '0')}-${String(parseInt(m[2], 10)).padStart(2, '0')}`;

  m = text.match(new RegExp(`^(${MONTH_ALT})\\s+(\\d{1,2})\\s+(\\d{4})$`, 'i'));
  if (m) return `${m[3]}-${String(monthNum(m[1])!).padStart(2, '0')}-${String(parseInt(m[2], 10)).padStart(2, '0')}`;

  m = text.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日$/);
  if (m) return `${m[1]}-${String(parseInt(m[2], 10)).padStart(2, '0')}-${String(parseInt(m[3], 10)).padStart(2, '0')}`;

  m = text.match(new RegExp(`^(\\d{1,2})(${MONTH_ALT})(\\d{4})$`, 'i'));
  if (m) return `${m[3]}-${String(monthNum(m[2])!).padStart(2, '0')}-${String(parseInt(m[1], 10)).padStart(2, '0')}`;

  m = text.match(new RegExp(`^(${MONTH_ALT})(\\d{1,2}),?(\\d{4})$`, 'i'));
  if (m) return `${m[3]}-${String(monthNum(m[1])!).padStart(2, '0')}-${String(parseInt(m[2], 10)).padStart(2, '0')}`;

  m = text.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/);
  if (m) return `${m[3]}-${String(parseInt(m[2], 10)).padStart(2, '0')}-${String(parseInt(m[1], 10)).padStart(2, '0')}`;

  m = text.match(/^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/);
  if (m) return `${m[1]}-${String(parseInt(m[2], 10)).padStart(2, '0')}-${String(parseInt(m[3], 10)).padStart(2, '0')}`;

  m = text.match(/^(\d{1,2})\s+(\d{1,2})\s+(\d{4})$/);
  if (m) return `${m[3]}-${String(parseInt(m[2], 10)).padStart(2, '0')}-${String(parseInt(m[1], 10)).padStart(2, '0')}`;

  return null;
}

/**
 * Parse partial dates that lack a day component (e.g. "June 2026" → "2026-06-01").
 * Kept separate from toIso so that complete-date matching never accidentally
 * treats a "Month Year" string as a full date with day=01.
 */
export function toIsoPartial(text: string): string | null {
  text = normalizeDateString(text).trim();

  let m = text.match(new RegExp(`^(${MONTH_ALT})\\s+(\\d{4})$`, 'i'));
  if (m) return `${m[2]}-${String(monthNum(m[1])!).padStart(2, '0')}-01`;

  return null;
}

export const DATEPAT =
  `(?:\\d{4}-\\d{2}-\\d{2}` +
  `|\\d{1,2}\\s+(?:${MONTH_ALT})\\s+\\d{4}` +
  `|${MONTH_ALT}\\s+\\d{1,2},?\\s+\\d{4}` +
  `|\\d{4}年\\d{1,2}月\\d{1,2}日` +
  `|\\d{1,2}(?:${MONTH_ALT})\\d{4}` +
  `|(?:${MONTH_ALT})\\d{1,2},?\\d{4}` +
  `|\\d{1,2}[/.]\\d{1,2}[/.]\\d{4}` +
  `|\\d{4}[/.]\\d{1,2}[/.]\\d{1,2})`;

export const DATE_SCAN = new RegExp(DATEPAT, 'gi');

export function scanDates(text: string): Array<{ index: number; iso: string }> {
  const found: Array<{ index: number; iso: string }> = [];
  const base = prepDateText(text);
  DATE_SCAN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = DATE_SCAN.exec(base)) !== null) {
    const iso = toIso(m[0]);
    if (iso) found.push({ index: m.index, iso });
    if (m.index === DATE_SCAN.lastIndex) DATE_SCAN.lastIndex++;
  }
  found.sort((a, b) => a.index - b.index);
  return found;
}

export function firstDateAfter(text: string, phrases: string[]): string {
  const base = prepDateText(text);
  const dates = scanDates(base);
  if (!dates.length) return '';
  for (const ph of phrases) {
    let idx = phraseIndex(base, normSp(ph));
    while (idx >= 0) {
      let best: string | null = null;
      let bestDist = Infinity;
      for (const d of dates) {
        const dist = d.index - idx;
        if (dist >= 0 && dist < bestDist) { bestDist = dist; best = d.iso; }
      }
      if (best) return best;
      idx = phraseIndex(base, normSp(ph), idx + 1);
    }
  }
  return '';
}
