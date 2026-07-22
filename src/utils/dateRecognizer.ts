import { RecognizedDate, DateType, DATE_TYPE_INFO, TextItem } from '@/types';
import { OcrResult, OcrWord } from './ocr';
import {
  normToken,
  toIso,
  toIsoPartial,
  normSp,
  cleanInvisible,
  prepDateText,
} from './textUtils';
import { logger } from './logger';

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

function isDateRelevant(str: string): boolean {
  const s = str.trim();
  if (!s) return false;
  if (s.match(/^\d{4}$/)) return true;
  if (s.match(/^\d{1,2}$/)) return true;
  if (s.match(/^(January|February|March|April|May|June|July|August|September|October|November|December)$/i)) return true;
  if (s.match(/^(Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/i)) return true;
  if (toIsoPartial(s)) return true;
  return false;
}

function skipNonDate(items: Array<{ str: string; x0: number; y: number; width: number; height: number; page: number }>, startIdx: number): number {
  let i = startIdx;
  while (i < items.length && !isDateRelevant(items[i].str)) {
    i++;
  }
  return i;
}

export function buildLines(
  items: Array<{ str: string; x0: number; y: number; width: number; height: number; page: number }>
): { lines: LineItem[]; plainText: string } {
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x0 - b.x0);
  const lines: LineItem[] = [];
  let cur: typeof items | null = null;
  let curY: number | null = null;

  for (const it of sorted) {
    if (cur === null || Math.abs(it.y - curY!) > 10) {
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

  const pushGroup = (
    arr: Array<{ str: string; x0: number; y: number; width: number; height: number; page: number }>,
    iso: string
  ) => {
    const x0 = Math.min(...arr.map((i) => i.x0));
    const x1 = Math.max(...arr.map((i) => i.x0 + i.width));
    const yTop = Math.max(...arr.map((i) => i.y));
    const yBot = Math.min(...arr.map((i) => i.y - i.height));
    groups.push({ x0, x1, yTop, yBot, iso });
  };

  const usedIndices = new Set<number>();

  // Phase 1: Match standalone complete dates (e.g. "13 January 2026", "2026-01-13").
  // toIso no longer matches "Month Year", so partial dates are naturally skipped.
  for (let i = 0; i < sorted.length; i++) {
    const iso = toIso(sorted[i].str);
    if (iso) {
      pushGroup([sorted[i]], iso);
      usedIndices.add(i);
    }
  }

  const isSameLine = (a: typeof items[0], b: typeof items[0]): boolean => {
    const maxY = Math.max(a.y, b.y);
    const minY = Math.min(a.y - a.height, b.y - b.height);
    return maxY - minY < 20;
  };

  const tryPush = (arr: typeof items): boolean => {
    const combo = arr.map((i) => normToken(i.str)).join(' ');
    const iso = toIso(combo);
    if (!iso) return false;
    pushGroup(arr, iso);
    return true;
  };

  // Phase 2: Combine adjacent tokens into complete dates.
  // "02" + "June 2026" → toIso("02 June 2026") → "2026-06-02"
  // A standalone "June 2026" won't match here because toIso rejects it.
  let i = 0;
  while (i < sorted.length) {
    if (usedIndices.has(i)) { i++; continue; }
    const cur = sorted[i];
    if (!isDateRelevant(cur.str)) { i++; continue; }

    if (tryPush([cur])) { usedIndices.add(i); i++; continue; }

    let j = skipNonDate(sorted, i + 1);
    if (j < sorted.length && !usedIndices.has(j) && isSameLine(cur, sorted[j]) && tryPush([cur, sorted[j]])) { usedIndices.add(i); usedIndices.add(j); i = j + 1; continue; }

    let k = j < sorted.length ? skipNonDate(sorted, j + 1) : sorted.length;
    if (k < sorted.length && !usedIndices.has(k) && isSameLine(cur, sorted[k]) && tryPush([cur, sorted[j], sorted[k]])) { usedIndices.add(i); usedIndices.add(j); usedIndices.add(k); i = k + 1; continue; }

    let l = k < sorted.length ? skipNonDate(sorted, k + 1) : sorted.length;
    if (l < sorted.length && !usedIndices.has(l) && isSameLine(cur, sorted[l]) && tryPush([cur, sorted[j], sorted[k], sorted[l]])) { usedIndices.add(i); usedIndices.add(j); usedIndices.add(k); usedIndices.add(l); i = l + 1; continue; }

    let m = l < sorted.length ? skipNonDate(sorted, l + 1) : sorted.length;
    if (m < sorted.length && !usedIndices.has(m) && isSameLine(cur, sorted[m]) && tryPush([cur, sorted[j], sorted[k], sorted[l], sorted[m]])) { usedIndices.add(i); usedIndices.add(j); usedIndices.add(k); usedIndices.add(l); usedIndices.add(m); i = m + 1; continue; }

    i++;
  }

  // Phase 3: Fallback for partial dates (e.g. "June 2026") that weren't combined.
  for (let i = 0; i < sorted.length; i++) {
    if (usedIndices.has(i)) continue;
    const iso = toIsoPartial(sorted[i].str);
    if (iso) {
      pushGroup([sorted[i]], iso);
      usedIndices.add(i);
    }
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

function keywordMatches(kwNorm: string, textNorm: string): boolean {
  if (kwNorm.includes('*')) {
    const parts = kwNorm.split('*');
    let pos = 0;
    for (const part of parts) {
      if (!part) continue;
      const idx = textNorm.indexOf(part, pos);
      if (idx < 0) return false;
      pos = idx + part.length;
    }
    return true;
  }
  return textNorm.includes(kwNorm);
}

function textItemsToUnified(
  textItems: TextItem[]
): Array<{ str: string; x0: number; y: number; width: number; height: number; page: number }> {
  const result = textItems.map((item) => ({
    str: cleanInvisible(item.text),
    x0: item.x,
    y: item.y + item.height,
    width: item.width,
    height: item.height,
    page: item.page,
  }));

  const dateItems = result.filter(i => i.str.match(/^\d{4}$/) || 
    i.str.match(/^\d{1,2}$/) || 
    i.str.match(/^(January|February|March|April|May|June|July|August|September|October|November|December)$/i) ||
    i.str.match(/^(Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/i));
  
  if (dateItems.length > 0) {
    logger.info(`[textItemsToUnified] 文本型PDF找到 ${dateItems.length} 个日期相关词`);
    for (const item of dateItems.slice(0, 10)) {
      logger.debug(`  "${item.str}" x0=${item.x0.toFixed(2)}, y=${item.y.toFixed(2)}, page=${item.page}`);
    }
  }

  return result;
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

          if (keywordMatches(kwNorm, currentLineNorm)) {
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

      if (!bestType) {
        for (const [dateType, info] of Object.entries(DATE_TYPE_INFO)) {
          for (const keyword of info.keywords) {
            const kwNorm = normSp(keyword);
            if (!kwNorm) continue;

            for (let li = Math.max(0, dg.li - WIN); li <= Math.min(lines.length - 1, dg.li + WIN); li++) {
              if (li === dg.li) continue;
              const line = lines[li];
              const n = normSp(line.text);
              if (!keywordMatches(kwNorm, n)) continue;

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
        logger.info(`[日期识别] 第${page}页 ${bestType} ${dg.iso}`);
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
  logger.info(`[recognizeDatesFromText] 文本型PDF，共 ${textItems.length} 个文本项`);
  
  const janLines = textItems.filter(item => 
    item.text.match(/January|January|2026|2031|13|28|29/i)
  );
  if (janLines.length > 0) {
    logger.info(`[recognizeDatesFromText] 包含日期关键词的行:`);
    for (const item of janLines.slice(0, 15)) {
      logger.debug(`  "${item.text}" x=${item.x.toFixed(2)}, y=${item.y.toFixed(2)}, page=${item.page}`);
    }
  }
  
  const unified = textItemsToUnified(textItems);
  const dates = recognizeDatesFromUnified(unified, 0.85);
  
  if (dates.length === 0) {
    logger.warn(`[recognizeDatesFromText] 未识别到日期，请检查日志`);
  }
  
  return dates;
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
