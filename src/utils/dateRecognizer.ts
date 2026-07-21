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

  lines.reverse();

  const plainText = lines.map((l) => l.text).join('\n');
  return { lines, plainText };
}

export function findDateGroups(
  items: Array<{ str: string; x0: number; y: number; width: number; height: number; page: number }>
): Omit<DateGroup, 'li' | 'lineY'>[] {
  const groups: Omit<DateGroup, 'li' | 'lineY'>[] = [];
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x0 - b.x0);

  const isSameLine = (a: typeof items[0], b: typeof items[0]): boolean => {
    const maxY = Math.max(a.y, b.y);
    const minY = Math.min(a.y - a.height, b.y - b.height);
    return maxY - minY < 20;
  };

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
    const cur = sorted[i];
    if (cur.str.trim() === '') {
      i++;
      continue;
    }

    if (tryPush([cur])) { i++; continue; }

    let j = i + 1;
    while (j < sorted.length && sorted[j].str.trim() === '') j++;
    if (j < sorted.length && isSameLine(cur, sorted[j]) && tryPush([cur, sorted[j]])) { i = j + 1; continue; }

    let k = j + 1;
    while (k < sorted.length && sorted[k].str.trim() === '') k++;
    if (k < sorted.length && isSameLine(cur, sorted[k]) && tryPush([cur, sorted[j], sorted[k]])) { i = k + 1; continue; }

    let l = k + 1;
    while (l < sorted.length && sorted[l].str.trim() === '') l++;
    if (l < sorted.length && isSameLine(cur, sorted[l]) && tryPush([cur, sorted[j], sorted[k], sorted[l]])) { i = l + 1; continue; }

    let m = l + 1;
    while (m < sorted.length && sorted[m].str.trim() === '') m++;
    if (m < sorted.length && isSameLine(cur, sorted[m]) && tryPush([cur, sorted[j], sorted[k], sorted[l], sorted[m]])) { i = m + 1; continue; }

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

  const WIN = 15;
  
  const expiryHighPriorityKeywords = ['Valid Until', 'Valid until', 'this Certificate is valid until', 'Date of Expiry', 'Expiry Date', 'Expires', 'expires on', 'accepted as valid until', 'valid until the'];

  for (const pageStr of Object.keys(allPageDates)) {
    const page = parseInt(pageStr);
    const pageDates = allPageDates[page] || [];
    const lines = allLines[page] || [];

    for (const dg of pageDates) {
      let bestType: DateType | null = null;
      let bestScore = -Infinity;
      let foundSameLineMatch = false;

      const currentLine = lines[dg.li];
      const currentLineNorm = normSp(currentLine.text);
      
      const hasRenewal = currentLineNorm.includes('renewal');
      const hasVerification = currentLineNorm.includes('verification');
      const hasCompletion = currentLineNorm.includes('completion');
      const contextPenalty = (hasRenewal || hasVerification || hasCompletion) ? 50 : 0;

      for (const [dateType, info] of Object.entries(DATE_TYPE_INFO)) {
        for (const keyword of info.keywords) {
          const kwNorm = normSp(keyword);
          if (!kwNorm) continue;

          if (currentLineNorm.includes(kwNorm)) {
            foundSameLineMatch = true;
            let score = 50 + Math.min(kwNorm.length / 10, 3);
            if (expiryHighPriorityKeywords.includes(keyword)) score += 10;
            
            if (dateType === 'EXPIRY' && (hasRenewal || hasVerification || hasCompletion)) {
              score -= contextPenalty;
            }
            
            if (score > bestScore) {
              bestScore = score;
              bestType = dateType as DateType;
            }
          }
        }
      }

      if (!foundSameLineMatch) {
        for (const [dateType, info] of Object.entries(DATE_TYPE_INFO)) {
          for (const keyword of info.keywords) {
            const kwNorm = normSp(keyword);
            if (!kwNorm) continue;

            for (let li = Math.max(0, dg.li - WIN); li <= Math.min(lines.length - 1, dg.li + WIN); li++) {
              if (li === dg.li) continue;
              const line = lines[li];
              const n = normSp(line.text);
              if (!n.includes(kwNorm)) continue;

              const dist = Math.abs(li - dg.li);
              const kwWeight = Math.min(kwNorm.length / 10, 3);
              const priorityBonus = expiryHighPriorityKeywords.includes(keyword) ? 10 : (dateType === 'ANNUAL_SURVEY' ? 5 : 0);
              const afterBonus = li > dg.li ? 0 : -2;
              const distPenalty = dist * 2;

              let score = kwWeight + priorityBonus + afterBonus - distPenalty;
              if (dateType === 'EXPIRY' && (hasRenewal || hasVerification || hasCompletion)) {
                score -= contextPenalty;
              }

              if (score > bestScore) {
                bestScore = score;
                bestType = dateType as DateType;
              }
            }
          }
        }
      }

      if (bestType && bestScore > 0) {
        const pad = 10;
        const dateObj = {
          type: bestType,
          date: dg.iso,
          confidence: Math.min(0.95, baseConfidence + bestScore * 0.02),
          page,
          position: {
            x: dg.x0 - pad,
            y: dg.yBot - pad,
            width: dg.x1 - dg.x0 + pad * 2,
            height: dg.yTop - dg.yBot + pad * 2,
          },
          rawText: dg.iso,
        };
        console.log(`[日期识别] 第${page}页 ${bestType} ${dg.iso}:`);
        console.log(`  yTop=${dg.yTop.toFixed(2)}, yBot=${dg.yBot.toFixed(2)}`);
        console.log(`  position: x=${dateObj.position.x.toFixed(2)}, y=${dateObj.position.y.toFixed(2)}, w=${dateObj.position.width.toFixed(2)}, h=${dateObj.position.height.toFixed(2)}`);
        dates.push(dateObj);
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
