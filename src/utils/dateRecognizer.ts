import { RecognizedDate, DateType, DATE_TYPE_INFO, TextItem } from '@/types';
import { OcrResult } from './ocr';
// 日期格式正则
const DATE_PATTERNS = [
  // DD Month YYYY (e.g., 15 January 2024)
  /(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i,
  // DD/MM/YYYY or DD.MM.YYYY or DD-MM-YYYY
  /(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{4})/,
  // YYYY-MM-DD
  /(\d{4})-(\d{1,2})-(\d{1,2})/,
  // Month DD, YYYY (e.g., January 15, 2024)
  /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})/i,
];

const MONTH_MAP: Record<string, string> = {
  january: '01', february: '02', march: '03', april: '04',
  may: '05', june: '06', july: '07', august: '08',
  september: '09', october: '10', november: '11', december: '12',
};

function parseDateFromMatch(match: RegExpMatchArray): string | null {
  const full = match[0];

  // Try DD Month YYYY
  const m1 = full.match(/(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i);
  if (m1) {
    const day = m1[1].padStart(2, '0');
    const month = MONTH_MAP[m1[2].toLowerCase()];
    const year = m1[3];
    return `${year}-${month}-${day}`;
  }

  // Try Month DD, YYYY
  const m2 = full.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})/i);
  if (m2) {
    const month = MONTH_MAP[m2[1].toLowerCase()];
    const day = m2[2].padStart(2, '0');
    const year = m2[3];
    return `${year}-${month}-${day}`;
  }

  // Try DD/MM/YYYY
  const m3 = full.match(/(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{4})/);
  if (m3) {
    const day = m3[1].padStart(2, '0');
    const month = m3[2].padStart(2, '0');
    const year = m3[3];
    return `${year}-${month}-${day}`;
  }

  // Try YYYY-MM-DD
  const m4 = full.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m4) {
    const year = m4[1];
    const month = m4[2].padStart(2, '0');
    const day = m4[3].padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  return null;
}

// 从文本型PDF中识别日期
export function recognizeDatesFromText(
  textItems: TextItem[],
  fullText: string
): RecognizedDate[] {
  const dates: RecognizedDate[] = [];

  for (const [dateType, info] of Object.entries(DATE_TYPE_INFO)) {
    for (const keyword of info.keywords) {
      // 在全文中搜索关键词+日期的组合
      const keywordPattern = keyword.replace(/\s+/g, '\\s+');
      const regex = new RegExp(
        `${keywordPattern}[^\\d]{0,30}(\\d{1,2}[\\s\\/\\-\\.]\\d{1,2}[\\s\\/\\-\\.]\\d{2,4}|\\d{1,2}\\s+\\w{3,9}\\s+\\d{2,4}|\\d{4}-\\d{1,2}-\\d{1,2}|\\w{3,9}\\s+\\d{1,2},?\\s+\\d{4})`,
        'gi'
      );

      let match;
      while ((match = regex.exec(fullText)) !== null) {
        const dateStr = parseDateFromMatch(match);
        if (!dateStr) continue;

        // 在textItems中查找该日期的坐标位置
        const position = findDatePosition(textItems, match[0]);

        dates.push({
          type: dateType as DateType,
          date: dateStr,
          confidence: 0.85,
          page: position?.page ?? 1,
          position: position?.position ?? { x: 0, y: 0, width: 100, height: 15 },
          rawText: match[0],
        });
      }
    }
  }

  // 额外：提取任何独立的日期（没有关键词前缀的情况）
  const standaloneDatePattern = /(\d{4}-\d{1,2}-\d{1,2})/g;
  let standaloneMatch;
  while ((standaloneMatch = standaloneDatePattern.exec(fullText)) !== null) {
    const dateStr = parseDateFromMatch(standaloneMatch);
    if (!dateStr) continue;
    
    const position = findDatePosition(textItems, standaloneMatch[0]);
    
    dates.push({
      type: 'EXPIRY' as DateType,
      date: dateStr,
      confidence: 0.5,
      page: position?.page ?? 1,
      position: position?.position ?? { x: 0, y: 0, width: 100, height: 15 },
      rawText: standaloneMatch[0],
    });
  }

  return deduplicateDates(dates);
}

// 从OCR结果中识别日期
export function recognizeDatesFromOcr(
  ocrResults: OcrResult[]
): RecognizedDate[] {
  const dates: RecognizedDate[] = [];

  for (let pageIdx = 0; pageIdx < ocrResults.length; pageIdx++) {
    const ocrResult = ocrResults[pageIdx];
    const pageNum = pageIdx + 1;

    for (const [dateType, info] of Object.entries(DATE_TYPE_INFO)) {
      for (const keyword of info.keywords) {
        const keywordPattern = keyword.replace(/\s+/g, '\\s+');
        const regex = new RegExp(
          `${keywordPattern}[^\\d]{0,30}(\\d{1,2}[\\s\\/\\-\\.]\\d{1,2}[\\s\\/\\-\\.]\\d{2,4}|\\d{1,2}\\s+\\w{3,9}\\s+\\d{2,4}|\\d{4}-\\d{1,2}-\\d{1,2}|\\w{3,9}\\s+\\d{1,2},?\\s+\\d{4})`,
          'gi'
        );

        let match;
        while ((match = regex.exec(ocrResult.text)) !== null) {
          const dateStr = parseDateFromMatch(match);
          if (!dateStr) continue;

          // 在OCR words中查找位置
          const position = findOcrDatePosition(ocrResult, match[0]);

          dates.push({
            type: dateType as DateType,
            date: dateStr,
            confidence: 0.7,
            page: pageNum,
            position: position ?? { x: 0, y: 0, width: 100, height: 15 },
            rawText: match[0],
          });
        }
      }
    }
  }

  return deduplicateDates(dates);
}

// 在textItems中查找日期文本的坐标
function findDatePosition(
  textItems: TextItem[],
  matchedText: string
): { page: number; position: { x: number; y: number; width: number; height: number } } | null {
  const normalized = matchedText.toLowerCase().trim();

  // 策略1：查找包含日期数字的关键item（最可靠）
  // 从matchedText中提取日期相关的关键词和数字
  const dateTokens = normalized.split(/[\s:,]+/).filter((t) => t.length > 0);

  // 找到所有与matchedText中token匹配的textItems
  const matchedItems: Array<{ item: TextItem; tokenIdx: number }> = [];
  for (let tokenIdx = 0; tokenIdx < dateTokens.length; tokenIdx++) {
    const token = dateTokens[tokenIdx];
    if (token.length < 2) continue;
    for (const item of textItems) {
      const itemText = item.text.toLowerCase().trim();
      if (itemText === token || (itemText.length > 2 && (itemText.includes(token) || token.includes(itemText)))) {
        matchedItems.push({ item, tokenIdx });
      }
    }
  }

  if (matchedItems.length > 0) {
    // 找到连续匹配的item组
    matchedItems.sort((a, b) => {
      if (a.item.page !== b.item.page) return a.item.page - b.item.page;
      return a.item.y - b.item.y;
    });

    // 取第一组匹配的items计算包围框
    const firstPage = matchedItems[0].item.page;
    const samePageItems = matchedItems.filter((m) => m.item.page === firstPage);

    if (samePageItems.length > 0) {
      const xs = samePageItems.map((m) => m.item.x);
      const ys = samePageItems.map((m) => m.item.y);
      const xEnds = samePageItems.map((m) => m.item.x + m.item.width);
      const yEnds = samePageItems.map((m) => m.item.y + m.item.height);

      const minX = Math.min(...xs);
      const maxX = Math.max(...xEnds);
      const minY = Math.min(...ys);
      const maxY = Math.max(...yEnds);

      return {
        page: firstPage,
        position: {
          x: minX - 2,
          y: minY - 2,
          width: maxX - minX + 4,
          height: maxY - minY + 4,
        },
      };
    }
  }

  // 策略2：按行组合查找
  // 将textItems按行分组（y坐标相近的为一行）
  const pageGroups: Record<number, TextItem[]> = {};
  for (const item of textItems) {
    if (!pageGroups[item.page]) pageGroups[item.page] = [];
    pageGroups[item.page].push(item);
  }

  for (const [pageStr, items] of Object.entries(pageGroups)) {
    const page = parseInt(pageStr);
    // 按y坐标排序
    const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);

    // 分行
    const lines: TextItem[][] = [];
    let currentLine: TextItem[] = [];
    let currentY: number | null = null;

    for (const item of sorted) {
      if (currentY === null || Math.abs(item.y - currentY) < 5) {
        currentLine.push(item);
        currentY = item.y;
      } else {
        if (currentLine.length > 0) lines.push(currentLine);
        currentLine = [item];
        currentY = item.y;
      }
    }
    if (currentLine.length > 0) lines.push(currentLine);

    // 对每行，按x坐标排序后拼接文本
    for (const line of lines) {
      line.sort((a, b) => a.x - b.x);
      const lineText = line.map((i) => i.text).join(' ').toLowerCase().replace(/\s+/g, ' ').trim();
      const lineNormalized = normalized.replace(/\s+/g, ' ').trim();

      // 检查行文本是否包含matchedText的关键部分
      if (lineText.includes(lineNormalized) || lineNormalized.includes(lineText)) {
        const xs = line.map((i) => i.x);
        const xEnds = line.map((i) => i.x + i.width);
        const ys = line.map((i) => i.y);
        const yEnds = line.map((i) => i.y + i.height);

        return {
          page,
          position: {
            x: Math.min(...xs) - 2,
            y: Math.min(...ys) - 2,
            width: Math.max(...xEnds) - Math.min(...xs) + 4,
            height: Math.max(...yEnds) - Math.min(...ys) + 4,
          },
        };
      }
    }
  }

  return null;
}

// 在OCR结果中查找日期位置
function findOcrDatePosition(
  ocrResult: OcrResult,
  matchedText: string
): { x: number; y: number; width: number; height: number } | null {
  const normalized = matchedText.toLowerCase().trim();
  const matchWords = normalized.split(/\s+/).filter((w) => w.length > 2);

  for (const word of ocrResult.words) {
    if (matchWords.some((mw) => mw.includes(word.text.toLowerCase()) || word.text.toLowerCase().includes(mw))) {
      const width = word.bbox.x1 - word.bbox.x0;
      const height = word.bbox.y1 - word.bbox.y0;
      return {
        x: word.bbox.x0 - 2,
        y: word.bbox.y0 - 2,
        width: width + 4,
        height: height + 4,
      };
    }
  }

  return null;
}

// 去重
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
