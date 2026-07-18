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

  for (const item of textItems) {
    if (normalized.includes(item.text.toLowerCase().trim()) && item.text.trim().length > 2) {
      return {
        page: item.page,
        position: {
          x: item.x - 2,
          y: item.y - 2,
          width: item.width + 4,
          height: item.height + 4,
        },
      };
    }
  }

  // 尝试通过连续item组合查找
  const matchWords = normalized.split(/\s+/);
  for (let i = 0; i < textItems.length; i++) {
    let combined = '';
    let startX = textItems[i].x;
    let startY = textItems[i].y;
    let endX = textItems[i].x + textItems[i].width;
    let maxHeight = textItems[i].height;
    let page = textItems[i].page;

    for (let j = i; j < Math.min(i + 10, textItems.length); j++) {
      combined += textItems[j].text.toLowerCase() + ' ';
      endX = textItems[j].x + textItems[j].width;
      maxHeight = Math.max(maxHeight, textItems[j].height);

      if (combined.trim().length > normalized.length * 0.5 && normalized.includes(combined.trim())) {
        return {
          page,
          position: {
            x: startX - 2,
            y: startY - 2,
            width: endX - startX + 4,
            height: maxHeight + 4,
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
      return {
        x: word.bbox.x0 - 2,
        y: word.bbox.y0 - 2,
        width: word.bbox.x1 - word.bbox.x0 + 4,
        height: word.bbox.y1 - word.bbox.y0 + 4,
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
