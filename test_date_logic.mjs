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
    if (!iso) {
      console.log(`    组合失败: "${combo}"`);
      return false;
    }
    console.log(`    组合成功: "${combo}" -> ${iso}`);
    groups.push({ iso });
    return true;
  };

  let i = 0;
  while (i < sorted.length) {
    const cur = sorted[i];
    if (!isDateRelevant(cur.str)) {
      i++;
      continue;
    }

    console.log(`处理词 "${cur.str}" (索引${i}, y=${cur.y})`);

    if (tryPush([cur])) { i++; continue; }

    let j = skipNonDate(sorted, i + 1);
    if (j < sorted.length) {
      console.log(`  j=${j}, 词="${sorted[j].str}", y=${sorted[j].y}, isSameLine=${isSameLine(cur, sorted[j])}`);
      if (isSameLine(cur, sorted[j]) && tryPush([cur, sorted[j]])) { i = j + 1; continue; }
    }

    let k = j < sorted.length ? skipNonDate(sorted, j + 1) : sorted.length;
    if (k < sorted.length) {
      console.log(`  k=${k}, 词="${sorted[k].str}", y=${sorted[k].y}, isSameLine=${isSameLine(cur, sorted[k])}`);
      if (isSameLine(cur, sorted[k]) && tryPush([cur, sorted[j], sorted[k]])) { i = k + 1; continue; }
    }

    console.log(`  所有组合都失败，跳过`);
    i++;
  }

  return groups;
}

console.log('=== 测试1: "13 January 2026" 在同一行 ===');
const test1 = [
  { str: 'Issued', x0: 10, y: 100, width: 40, height: 10, page: 1 },
  { str: 'at', x0: 55, y: 100, width: 15, height: 10, page: 1 },
  { str: 'BUSAN,', x0: 75, y: 100, width: 50, height: 10, page: 1 },
  { str: 'KOREA', x0: 130, y: 100, width: 40, height: 10, page: 1 },
  { str: 'on', x0: 300, y: 100, width: 20, height: 10, page: 1 },
  { str: '13', x0: 330, y: 100, width: 15, height: 10, page: 1 },
  { str: 'January', x0: 350, y: 100, width: 50, height: 10, page: 1 },
  { str: '2026', x0: 405, y: 100, width: 30, height: 10, page: 1 },
];
console.log('日期相关词:', test1.filter(i => isDateRelevant(i.str)).map(i => i.str));
const result1 = findDateGroups(test1);
console.log('结果:', result1.length, '个日期组');

console.log('\n=== 测试2: "01 June 2031" 在同一行（中间有*） ===');
const test2 = [
  { str: 'This', x0: 10, y: 200, width: 25, height: 10, page: 1 },
  { str: 'certificate', x0: 40, y: 200, width: 60, height: 10, page: 1 },
  { str: 'is', x0: 105, y: 200, width: 10, height: 10, page: 1 },
  { str: 'valid', x0: 120, y: 200, width: 30, height: 10, page: 1 },
  { str: 'until', x0: 155, y: 200, width: 28, height: 10, page: 1 },
  { str: '*', x0: 188, y: 200, width: 5, height: 10, page: 1 },
  { str: '01', x0: 200, y: 200, width: 15, height: 10, page: 1 },
  { str: 'June', x0: 220, y: 200, width: 30, height: 10, page: 1 },
  { str: '2031', x0: 255, y: 200, width: 30, height: 10, page: 1 },
];
console.log('日期相关词:', test2.filter(i => isDateRelevant(i.str)).map(i => i.str));
const result2 = findDateGroups(test2);
console.log('结果:', result2.length, '个日期组');

console.log('\n=== 测试3: 单行文本 "13 January 2026" ===');
const test3 = [
  { str: '13', x0: 10, y: 100, width: 15, height: 10, page: 1 },
  { str: 'January', x0: 30, y: 100, width: 50, height: 10, page: 1 },
  { str: '2026', x0: 85, y: 100, width: 30, height: 10, page: 1 },
];
console.log('日期相关词:', test3.filter(i => isDateRelevant(i.str)).map(i => i.str));
const result3 = findDateGroups(test3);
console.log('结果:', result3.length, '个日期组');
