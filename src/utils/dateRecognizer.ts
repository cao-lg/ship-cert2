import { RecognizedDate, DateType, DATE_TYPE_INFO, TextItem } from '@/types';
import { OcrResult, OcrWord } from './ocr';
import {
  normToken,
  toIso,
  normSp,
  cleanInvisible,
  prepDateText,
} from './textUtils';

export interface DateGroup {
  x0: number;
  x1: number;
  yTop: number;
  yBot: number;
  iso: string;
  li: number;
  lineY: number;
}

export interface LineItem {
  items: Array<{ str: string; x0: number; y: number; width: number; height: number; page: number }>;
  text: string;
  x0: number;
}

export function buildLines(
  items: Array<{ str: string; x0: number; y: number; width: number; height: number; page: number }>
): { lines: LineItem[]; plainText: string } {
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x0 - b.x0);
  const lines: LineItem[] = [];
  let cur: typeof items | null = null;
  let curY: number | null = null;

  for (const it of sorted) {
    if (cur === null || Math.abs(it.y - curY!) > 4) {
      cur = [];
      curY = it.y;
      lines.push({ items: cur, text: '', x0: 0 });
    }
    cur.push(it);
  }

  for (const line of lines) {
    line.items.sort((a, b) => a.x0 - b.x0);
    line.text = line.items.map((i) => i.str).join(' ');
    line.x0 = Math.min(...line.items.map((i) => i.x0));
  }

  const plainText = lines.map((l) => l.text).join('\n');
  return { lines, plainText };
}

export function findDateGroups(
  items: Array<{ str: string; x0: number; y: number; width: number; height: number; page: number }>
): Omit<DateGroup, 'li' | 'lineY'>[] {
  const groups: Omit<DateGroup, 'li' | 'lineY'>[] = [];
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x0 - b.x0);

  const tryPush = (arr: typeof items): boolean => {
    const combo = arr.map((i) => normToken(i.str)).join(' ');
    const iso = toIso(combo);
    if (!iso) return false;

    const x0 = Math.min(...arr.map((i) => i.x0));
    const x1 = Math.max(...arr.map((i) => i.x0 + i.width));
    const yTop = Math.max(...arr.map((i) => i.y));
    const yBot = Math.min(...arr.map((i) => i.y - i.height));

    groups.push({ x0, x1, yTop, yBot, iso });
    return true;
  };

  let i = 0;
  while (i < sorted.length) {
    if (tryPush([sorted[i]])) { i++; continue; }
    if (i + 2 < sorted.length && tryPush(sorted.slice(i, i + 3))) { i += 3; continue; }
    if (i + 4 < sorted.length && tryPush(sorted.slice(i, i + 5))) { i += 5; continue; }
    i++;
  }

  return groups;
}

function nearestDate(
  pageDates: (DateGroup)[],
  li: number,
  yPhrase: number,
  used: Set<string>,
  keyOf: (g: DateGroup) => string
): DateGroup | null {
  const WIN = 12;
  let best: DateGroup | null = null;
  let bestScore = Infinity;

  for (const g of pageDates) {
    if (used.has(keyOf(g))) continue;
    if (Math.abs(g.li - li) > WIN) continue;
    const dy = Math.abs(g.lineY - yPhrase);
    const score = g.li === li ? dy : g.li > li ? 30 + dy : 80 + dy;
    if (score < bestScore) { bestScore = score; best = g; }
  }

  return best;
}

function textItemsToUnified(
  textItems: TextItem[]
): Array<{ str: string; x0: number; y: number; width: number; height: number; page: number }> {
  return textItems.map((item) => ({
    str: cleanInvisible(item.text),
    x0: item.x,
    y: item.y + item.height,
    width: item.width,
    height: item.height,
    page: item.page,
  }));
}

function ocrWordsToUnified(
  words: OcrWord[],
  page: number
): Array<{ str: string; x0: number; y: number; width: number; height: number; page: number }> {
  return words.map((w) => ({
    str: cleanInvisible(w.text),
    x0: w.bbox.x0,
    y: w.bbox.y1,
    width: w.bbox.x1 - w.bbox.x0,
    height: w.bbox.y1 - w.bbox.y0,
    page,
  }));
}

export function recognizeDatesFromUnified(
  items: Array<{ str: string; x0: number; y: number; width: number; height: number; page: number }>,
  baseConfidence: number
): RecognizedDate[] {
  const dates: RecognizedDate[] = [];

  const itemsByPage: Record<number, typeof items> = {};
  for (const item of items) {
    if (!itemsByPage[item.page]) itemsByPage[item.page] = [];
    itemsByPage[item.page].push(item);
  }

  const allPageDates: Record<number, DateGroup[]> = {};
  const allLines: Record<number, LineItem[]> = {};

  for (const pageStr of Object.keys(itemsByPage)) {
    const page = parseInt(pageStr);
    const pageItems = itemsByPage[page];
    const { lines } = buildLines(pageItems);
    allLines[page] = lines;

    const pageDates: DateGroup[] = [];
    lines.forEach((line, li) => {
      const dgs = findDateGroups(line.items).map((g) => ({
        ...g,
        li,
        lineY: line.items.reduce((s, i) => s + i.y, 0) / Math.max(1, line.items.length),
      }));
      pageDates.push(...dgs);
    });
    allPageDates[page] = pageDates;
  }

  const keyOf = (g: DateGroup) =>
    `${Math.round(g.x0)}-${Math.round(g.yBot)}-${Math.round(g.x1)}-${Math.round(g.yTop)}`;

  for (const pageStr of Object.keys(allLines)) {
    const page = parseInt(pageStr);
    const lines = allLines[page];
    const pageDates = allPageDates[page] || [];
    const used = new Set<string>();

    for (let li = 0; li < lines.length; li++) {
      const line = lines[li];
      const n = normSp(line.text);
      const lineY = line.items.reduce((s, i) => s + i.y, 0) / Math.max(1, line.items.length);

      let matchedType: DateType | null = null;
      let highestConf = 0;

      for (const [dateType, info] of Object.entries(DATE_TYPE_INFO)) {
        for (const keyword of info.keywords) {
          if (n.includes(normSp(keyword))) {
            if (baseConfidence > highestConf) {
              highestConf = baseConfidence;
              matchedType = dateType as DateType;
            }
            break;
          }
        }
      }

      if (matchedType) {
        const g = nearestDate(pageDates, li, lineY, used, keyOf);
        if (g) {
          used.add(keyOf(g));
          const pad = 3;
          dates.push({
            type: matchedType,
            date: g.iso,
            confidence: highestConf,
            page,
            position: {
              x: g.x0 - pad,
              y: g.yBot - pad,
              width: g.x1 - g.x0 + pad * 2,
              height: g.yTop - g.yBot + pad * 2,
            },
            rawText: g.iso,
          });
        }
      }
    }
  }

  return deduplicateDates(dates);
}

export function recognizeDatesFromText(
  textItems: TextItem[],
  fullText: string
): RecognizedDate[] {
  const unified = textItemsToUnified(textItems);
  return recognizeDatesFromUnified(unified, 0.85);
}

export function recognizeDatesFromOcr(
  ocrResults: OcrResult[]
): RecognizedDate[] {
  const allItems: Array<{ str: string; x0: number; y: number; width: number; height: number; page: number }> = [];

  for (let pageIdx = 0; pageIdx < ocrResults.length; pageIdx++) {
    const ocrResult = ocrResults[pageIdx];
    const pageNum = pageIdx + 1;
    const unified = ocrWordsToUnified(ocrResult.words, pageNum);
    allItems.push(...unified);
  }

  return recognizeDatesFromUnified(allItems, 0.7);
}

function deduplicateDates(dates: RecognizedDate[]): RecognizedDate[] {
  const seen = new Map<string, RecognizedDate>();

  for (const d of dates) {
    const key = `${d.type}-${d.date}`;
    const existing = seen.get(key);
    if (!existing || d.confidence > existing.confidence) {
      seen.set(key, d);
    }
  }

  return Array.from(seen.values());
}
