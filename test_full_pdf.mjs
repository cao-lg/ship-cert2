import * as pdfjsLib from 'pdfjs-dist';
import { readFileSync } from 'fs';

pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdfjs-dist/build/pdf.worker.mjs';

const MONTHS = {
  January: 1, February: 2, March: 3, April: 4, May: 5, June: 6,
  July: 7, August: 8, September: 9, October: 10, November: 11, December: 12,
};
const MONTH_ABBR = {
  Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
  Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
};
const MONTH_LOOKUP = {};
for (const [name, num] of Object.entries({ ...MONTHS, ...MONTH_ABBR })) {
  MONTH_LOOKUP[name.toLowerCase()] = num;
}
function monthNum(s) {
  return MONTH_LOOKUP[String(s).toLowerCase()] || null;
}

const MONTH_NAME_ALT = Object.keys(MONTHS).join('|');
const MONTH_ABBR_ALT = Object.keys(MONTH_ABBR).join('|');
const MONTH_ALT = `${MONTH_NAME_ALT}|${MONTH_ABBR_ALT}`;

function toIso(text) {
  text = text.trim();
  let m = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  m = text.match(new RegExp(`^(\\d{1,2})\\s+(${MONTH_ALT})\\s+(\\d{4})$`, 'i'));
  if (m) return `${m[3]}-${String(monthNum(m[2])).padStart(2, '0')}-${String(parseInt(m[1], 10)).padStart(2, '0')}`;

  m = text.match(new RegExp(`^(${MONTH_ALT})\\s+(\\d{1,2}),?\\s+(\\d{4})$`, 'i'));
  if (m) return `${m[3]}-${String(monthNum(m[1])).padStart(2, '0')}-${String(parseInt(m[2], 10)).padStart(2, '0')}`;

  m = text.match(new RegExp(`^(${MONTH_ALT})\\s+(\\d{4})$`, 'i'));
  if (m) return `${m[2]}-${String(monthNum(m[1])).padStart(2, '0')}-01`;

  return null;
}

function isDateRelevant(str) {
  const s = str.trim();
  if (!s) return false;
  if (s.match(/^\d{4}$/)) return true;
  if (s.match(/^\d{1,2}$/)) return true;
  if (s.match(/^(January|February|March|April|May|June|July|August|September|October|November|December)$/i)) return true;
  if (s.match(/^(Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/i)) return true;
  return false;
}

function skipNonDate(items, startIdx) {
  let i = startIdx;
  while (i < items.length && !isDateRelevant(items[i].str)) {
    i++;
  }
  return i;
}

function buildLines(items) {
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x0 - b.x0);
  const lines = [];
  let cur = null;
  let curY = null;

  for (const it of sorted) {
    if (cur === null || Math.abs(it.y - curY) > 4) {
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
  return { lines, plainText: lines.map((l) => l.text).join('\n') };
}

function findDateGroups(items) {
  const groups = [];
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x0 - b.x0);

  const isSameLine = (a, b) => {
    const maxY = Math.max(a.y, b.y);
    const minY = Math.min(a.y - a.height, b.y - b.height);
    return maxY - minY < 20;
  };

  const tryPush = (arr) => {
    const combo = arr.map((i) => i.str.trim()).join(' ');
    const iso = toIso(combo);
    if (!iso) return false;
    groups.push({ iso, combo });
    return true;
  };

  let i = 0;
  while (i < sorted.length) {
    const cur = sorted[i];
    if (!isDateRelevant(cur.str)) {
      i++;
      continue;
    }

    if (tryPush([cur])) { i++; continue; }

    let j = skipNonDate(sorted, i + 1);
    if (j < sorted.length && isSameLine(cur, sorted[j]) && tryPush([cur, sorted[j]])) { i = j + 1; continue; }

    let k = j < sorted.length ? skipNonDate(sorted, j + 1) : sorted.length;
    if (k < sorted.length && isSameLine(cur, sorted[k]) && tryPush([cur, sorted[j], sorted[k]])) { i = k + 1; continue; }

    let l = k < sorted.length ? skipNonDate(sorted, k + 1) : sorted.length;
    if (l < sorted.length && isSameLine(cur, sorted[l]) && tryPush([cur, sorted[j], sorted[k], sorted[l]])) { i = l + 1; continue; }

    i++;
  }

  return groups;
}

const filePath = process.argv[2] || '/workspace/.trae/documents/COF 2026-11-01.pdf';
console.log('测试文件:', filePath);

async function main() {
  const data = new Uint8Array(readFileSync(filePath));
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const pageCount = pdf.numPages;
  console.log('页数:', pageCount);

  const allItems = [];
  let totalItems = 0;
  let meaningfulTextCount = 0;

  for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.0 });
    const textContent = await page.getTextContent();
    const pageHeight = viewport.height;

    console.log(`\n=== 第${pageNum}页，高度: ${pageHeight.toFixed(2)} ===`);
    console.log(`文本项数量: ${textContent.items.length}`);

    for (const item of textContent.items) {
      if (!('str' in item)) continue;
      const str = item.str;
      totalItems++;

      if (str.trim().length > 1) {
        meaningfulTextCount++;
      }

      const transform = item.transform;
      const itemHeight = Math.abs(transform[3]) || 12;
      const rawWidth = item.width;
      const itemWidth = rawWidth || Math.abs(transform[0] * str.length) || str.length * 8;

      allItems.push({
        text: str,
        x: transform[4],
        y: transform[5],
        width: itemWidth,
        height: itemHeight,
        page: pageNum,
      });
    }
  }

  const isImageBased = totalItems === 0 || meaningfulTextCount / totalItems < 0.3;
  console.log(`\n=== 判断结果 ===`);
  console.log(`总文本项: ${totalItems}`);
  console.log(`有效文本项: ${meaningfulTextCount}`);
  console.log(`有效比例: ${totalItems > 0 ? (meaningfulTextCount / totalItems * 100).toFixed(1) + '%' : 'N/A'}`);
  console.log(`是否图片型: ${isImageBased}`);

  if (!isImageBased) {
    console.log(`\n=== 文本型PDF，尝试日期识别 ===`);
    
    const unified = allItems.map((item) => ({
      str: item.text,
      x0: item.x,
      y: item.y + item.height,
      width: item.width,
      height: item.height,
      page: item.page,
    }));

    const dateItems = unified.filter(i => isDateRelevant(i.str));
    console.log(`日期相关词: ${dateItems.length} 个`);
    for (const item of dateItems.slice(0, 20)) {
      console.log(`  "${item.str}" x0=${item.x0.toFixed(2)}, y=${item.y.toFixed(2)}, h=${item.height.toFixed(2)}, page=${item.page}`);
    }

    const { lines } = buildLines(unified);
    console.log(`\n总行数: ${lines.length}`);

    let totalDateGroups = 0;
    lines.forEach((line, li) => {
      const dgs = findDateGroups(line.items);
      if (dgs.length > 0) {
        console.log(`\n行${li}: "${line.text.substring(0, 80)}..."`);
        for (const dg of dgs) {
          console.log(`  ${dg.combo} -> ${dg.iso}`);
        }
        totalDateGroups += dgs.length;
      }
    });

    console.log(`\n共找到 ${totalDateGroups} 个日期组`);
  }
}

main().catch(console.error);
