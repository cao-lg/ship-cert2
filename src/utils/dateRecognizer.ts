import { RecognizedDate, DateType, DATE_TYPE_INFO, TextItem } from '@/types';
import { OcrResult } from './ocr';
// 日期格式正则
const DATE_PATTERNS = [
  // DD Month YYYY (e.g., 15 January 2024)
  /(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[\.,]?\s+(\d{4})/i,
  // DD/MM/YYYY or DD.MM.YYYY or DD-MM-YYYY
  /(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{4})/,
  // YYYY-MM-DD
  /(\d{4})-(\d{1,2})-(\d{1,2})/,
  // Month DD, YYYY (e.g., January 15, 2024)
  /(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),?\s+(\d{4})/i,
];

const MONTH_MAP: Record<string, string> = {
  january: '01', february: '02', march: '03', april: '04',
  may: '05', june: '06', july: '07', august: '08',
  september: '09', october: '10', november: '11', december: '12',
  jan: '01', feb: '02', mar: '03', apr: '04',
  jun: '06', jul: '07', aug: '08', sep: '09',
  oct: '10', nov: '11', dec: '12',
};

function parseDateFromMatch(match: RegExpMatchArray): string | null {
  const full = match[0];

  // Try DD Month YYYY
  const m1 = full.match(/(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[\.,]?\s+(\d{4})/i);
  if (m1) {
    const day = m1[1].padStart(2, '0');
    const month = MONTH_MAP[m1[2].toLowerCase()];
    const year = m1[3];
    return `${year}-${month}-${day}`;
  }

  // Try Month DD, YYYY
  const m2 = full.match(/(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),?\s+(\d{4})/i);
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
        `${keywordPattern}[^\\d]{0,30}(\\d{1,2}[\\s\\/\\-\\.]\\d{1,2}[\\s\\/\\-\\.]\\d{2,4}|\\d{1,2}\\s+\\w{3,9}[\\.,]?\\s+\\d{2,4}|\\d{4}-\\d{1,2}-\\d{1,2}|\\w{3,9}\\s+\\d{1,2},?\\s+\\d{4})`,
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
    
    const positionResult = findDatePosition(textItems, standaloneMatch[0]);
    if (positionResult) {
      dates.push({
        type: 'EXPIRY' as DateType,
        date: dateStr,
        confidence: 0.5,
        page: positionResult.page,
        position: positionResult.position,
        rawText: standaloneMatch[0],
      });
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
          `${keywordPattern}[^\\d]{0,30}(\\d{1,2}[\\s\\/\\-\\.]\\d{1,2}[\\s\\/\\-\\.]\\d{2,4}|\\d{1,2}\\s+\\w{3,9}[\\.,]?\\s+\\d{2,4}|\\d{4}-\\d{1,2}-\\d{1,2}|\\w{3,9}\\s+\\d{1,2},?\\s+\\d{4})`,
          'gi'
        );

        let match;
        while ((match = regex.exec(ocrResult.text)) !== null) {
          const dateStr = parseDateFromMatch(match);
          if (!dateStr) continue;

          const position = findOcrDatePosition(ocrResult, match[0]);
          dates.push({
            type: dateType as DateType,
            date: dateStr,
            confidence: position ? 0.7 : 0.5,
            page: pageNum,
            position: position || { x: 0, y: 0, width: 100, height: 20 },
            rawText: match[0],
          });
        }
      }
    }

    // 额外：提取任何独立的日期（没有关键词前缀的情况）
    const standalonePatterns = [
      /(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[\.,]?\s+(\d{4})/gi,
      /(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),?\s+(\d{4})/gi,
      /(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{4})/g,
      /(\d{4})-(\d{1,2})-(\d{1,2})/g,
    ];

    for (const pattern of standalonePatterns) {
      let match;
      while ((match = pattern.exec(ocrResult.text)) !== null) {
        const dateStr = parseDateFromMatch(match);
        if (!dateStr) continue;

        const position = findOcrDatePosition(ocrResult, match[0]);
        if (position) {
          dates.push({
            type: 'EXPIRY' as DateType,
            date: dateStr,
            confidence: 0.4,
            page: pageNum,
            position,
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

  // 从matchedText中提取日期字符串（如 "19 March 2026", "18/09/2026" 等）
  const dateMatch = normalized.match(/(\d{1,2}\s+\w{3,9}[\.,]?\s+\d{2,4}|\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{2,4}|\d{4}-\d{1,2}-\d{1,2}|\w{3,9}\s+\d{1,2},?\s+\d{4})/);

  // 策略1：直接查找包含日期数字的textItem（最可靠）
  if (dateMatch) {
    const dateStr = dateMatch[0].toLowerCase().trim();
    // 尝试完整日期匹配
    for (const item of textItems) {
      const itemText = item.text.toLowerCase().trim();
      if (itemText === dateStr || itemText.includes(dateStr)) {
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

    // 尝试日期的部分匹配（如"19 March 2026"可能被分成多个item）
    const dateParts = dateStr.split(/[\s,]+/).filter((p) => p.length > 0);
    const matchedParts: TextItem[] = [];
    for (const part of dateParts) {
      for (const item of textItems) {
        const itemText = item.text.toLowerCase().trim();
        if (itemText === part) {
          matchedParts.push(item);
          break;
        }
      }
    }
    if (matchedParts.length >= 2) {
      // 只取同一页同一行的items
      const firstItem = matchedParts[0];
      const sameLine = matchedParts.filter(
        (item) => item.page === firstItem.page && Math.abs(item.y - firstItem.y) < 5
      );
      if (sameLine.length >= 2) {
        const xs = sameLine.map((i) => i.x);
        const xEnds = sameLine.map((i) => i.x + i.width);
        return {
          page: firstItem.page,
          position: {
            x: Math.min(...xs) - 2,
            y: firstItem.y - 2,
            width: Math.max(...xEnds) - Math.min(...xs) + 4,
            height: firstItem.height + 4,
          },
        };
      }
    }
  }

  // 策略2：查找关键词+日期在同一行的情况
  // 将textItems按页和行分组
  const pageGroups: Record<number, TextItem[]> = {};
  for (const item of textItems) {
    if (!pageGroups[item.page]) pageGroups[item.page] = [];
    pageGroups[item.page].push(item);
  }

  for (const [pageStr, items] of Object.entries(pageGroups)) {
    const page = parseInt(pageStr);
    // 按y坐标排序（y大的在上面，因为左下角原点）
    const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);

    // 分行：y坐标相近的为一行
    const lines: TextItem[][] = [];
    let currentLine: TextItem[] = [];
    let currentY: number | null = null;

    for (const item of sorted) {
      if (currentY === null || Math.abs(item.y - currentY) < 5) {
        currentLine.push(item);
        currentY = currentY === null ? item.y : currentY;
      } else {
        if (currentLine.length > 0) lines.push(currentLine);
        currentLine = [item];
        currentY = item.y;
      }
    }
    if (currentLine.length > 0) lines.push(currentLine);

    // 对每行检查是否包含matchedText的关键内容
    for (const line of lines) {
      line.sort((a, b) => a.x - b.x);
      const lineText = line.map((i) => i.text).join(' ').toLowerCase().replace(/\s+/g, ' ').trim();

      // 检查行文本是否包含日期
      if (dateMatch && lineText.includes(dateMatch[0].toLowerCase())) {
        // 找到日期在行中的位置
        const dateItems = line.filter((item) => {
          const itemText = item.text.toLowerCase().trim();
          return dateMatch[0].toLowerCase().includes(itemText) && itemText.length > 0;
        });

        if (dateItems.length > 0) {
          const xs = dateItems.map((i) => i.x);
          const xEnds = dateItems.map((i) => i.x + i.width);
          return {
            page,
            position: {
              x: Math.min(...xs) - 2,
              y: dateItems[0].y - 2,
              width: Math.max(...xEnds) - Math.min(...xs) + 4,
              height: dateItems[0].height + 4,
            },
          };
        }

        // 如果找不到具体日期item，用整行
        const xs = line.map((i) => i.x);
        const xEnds = line.map((i) => i.x + i.width);
        return {
          page,
          position: {
            x: Math.min(...xs) - 2,
            y: line[0].y - 2,
            width: Math.max(...xEnds) - Math.min(...xs) + 4,
            height: line[0].height + 4,
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

  const datePattern = /(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[\.,]?\s+(\d{4})/i;
  const datePattern2 = /(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{4})/;
  const datePattern3 = /(\d{4})-(\d{1,2})-(\d{1,2})/;
  const datePattern4 = /(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),?\s+(\d{4})/i;

  let day = '';
  let month = '';
  let year = '';

  const m1 = normalized.match(datePattern);
  if (m1) {
    day = m1[1];
    month = m1[2].toLowerCase();
    year = m1[3];
  } else {
    const m2 = normalized.match(datePattern2);
    if (m2) {
      day = m2[1];
      month = m2[2];
      year = m2[3];
    } else {
      const m3 = normalized.match(datePattern3);
      if (m3) {
        year = m3[1];
        month = m3[2];
        day = m3[3];
      } else {
        const m4 = normalized.match(datePattern4);
        if (m4) {
          month = m4[1].toLowerCase();
          day = m4[2];
          year = m4[3];
        }
      }
    }
  }

  if (!year) return null;

  const yearWords = ocrResult.words.filter((w) => w.text.includes(year));
  if (yearWords.length === 0) return null;

  const monthKeywords = [
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december',
    'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
    '01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12',
  ];

  let bestMatch: typeof ocrResult.words[0] | null = null;
  let bestScore = 0;

  for (const yearWord of yearWords) {
    const sameLine = ocrResult.words.filter(
      (w) => Math.abs(w.bbox.y0 - yearWord.bbox.y0) < 30 && Math.abs(w.bbox.y1 - yearWord.bbox.y1) < 30
    );
    sameLine.sort((a, b) => a.bbox.x0 - b.bbox.x0);

    let score = 1;

    for (const w of sameLine) {
      const wordText = w.text.toLowerCase().trim();
      
      if (month && monthKeywords.some((mk) => wordText.includes(mk) || mk.includes(wordText))) {
        score += 2;
      }
      
      if (day && wordText === day) {
        score += 2;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = yearWord;
    }
  }

  if (!bestMatch) return null;

  const sameLine = ocrResult.words.filter(
    (w) => Math.abs(w.bbox.y0 - bestMatch.bbox.y0) < 30 && Math.abs(w.bbox.y1 - bestMatch.bbox.y1) < 30
  );
  sameLine.sort((a, b) => a.bbox.x0 - b.bbox.x0);

  const dateWords: typeof ocrResult.words = [];
  for (const w of sameLine) {
    const wordText = w.text.toLowerCase().trim();
    
    if (wordText.includes(year)) {
      dateWords.push(w);
    } else if (month && monthKeywords.some((mk) => wordText.includes(mk) || mk.includes(wordText))) {
      dateWords.push(w);
    } else if (day && wordText === day) {
      dateWords.push(w);
    }
  }

  if (dateWords.length === 0) {
    return {
      x: bestMatch.bbox.x0 - 2,
      y: bestMatch.bbox.y0 - 2,
      width: bestMatch.bbox.x1 - bestMatch.bbox.x0 + 4,
      height: bestMatch.bbox.y1 - bestMatch.bbox.y0 + 4,
    };
  }

  const xs = dateWords.map((w) => w.bbox.x0);
  const xEnds = dateWords.map((w) => w.bbox.x1);
  const ys = dateWords.map((w) => w.bbox.y0);
  const yEnds = dateWords.map((w) => w.bbox.y1);

  return {
    x: Math.min(...xs) - 4,
    y: Math.min(...ys) - 4,
    width: Math.max(...xEnds) - Math.min(...xs) + 8,
    height: Math.max(...yEnds) - Math.min(...ys) + 8,
  };
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
