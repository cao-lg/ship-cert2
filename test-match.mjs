// 模拟OCR日期位置匹配测试
// 测试 findOcrDatePosition 的逻辑是否正确

const pageHeight = 842.4;

// 模拟OCR words数据
// 页面上方有真实的日期: "02 June 2026"
// 页面底部有表单编号: "Form 2221 (2026.03)"
const mockWords = [
  // 页面上方的日期 (y应该很大，因为PDF坐标y向上)
  { text: '02', bbox: { x0: 350, y0: 750, x1: 370, y1: 770 } },
  { text: 'June', bbox: { x0: 380, y0: 750, x1: 420, y1: 770 } },
  { text: '2026', bbox: { x0: 430, y0: 750, x1: 470, y1: 770 } },
  
  // 页面中间的另一个日期
  { text: '01', bbox: { x0: 350, y0: 790, x1: 370, y1: 810 } },
  { text: 'November', bbox: { x0: 380, y0: 790, x1: 460, y1: 810 } },
  { text: '2026', bbox: { x0: 470, y0: 790, x1: 510, y1: 810 } },
  
  // 签名区域的年份 (y中等)
  { text: '2026', bbox: { x0: 500, y0: 550, x1: 540, y1: 570 } },
  { text: 'Lloyd\'s', bbox: { x0: 450, y0: 550, x1: 500, y1: 570 } },
  
  // 页面底部的表单编号 (y应该很小)
  { text: 'Form', bbox: { x0: 50, y0: 30, x1: 85, y1: 45 } },
  { text: '2221', bbox: { x0: 90, y0: 30, x1: 120, y1: 45 } },
  { text: '(2026.03)', bbox: { x0: 125, y0: 30, x1: 185, y1: 45 } },
];

function findOcrDatePosition(ocrResult, matchedText) {
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
  console.log(`\n找到 ${yearWords.length} 个包含 "${year}" 的word:`);
  yearWords.forEach((w, i) => {
    console.log(`  ${i}: "${w.text}"  y0=${w.bbox.y0} y1=${w.bbox.y1} (y越大越靠上)`);
  });
  
  if (yearWords.length === 0) return null;

  const monthKeywords = [
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december',
    'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
    '01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12',
  ];

  let bestMatch = null;
  let bestScore = 0;

  for (const yearWord of yearWords) {
    const sameLine = ocrResult.words.filter(
      (w) => Math.abs(w.bbox.y0 - yearWord.bbox.y0) < 30 && Math.abs(w.bbox.y1 - yearWord.bbox.y1) < 30
    );
    sameLine.sort((a, b) => a.bbox.x0 - b.bbox.x0);

    let score = 1;
    const matchedMonths = [];
    const matchedDays = [];

    for (const w of sameLine) {
      const wordText = w.text.toLowerCase().trim();
      
      if (month && monthKeywords.some((mk) => wordText.includes(mk) || mk.includes(wordText))) {
        score += 2;
        matchedMonths.push(w.text);
      }
      
      if (day && wordText === day) {
        score += 2;
        matchedDays.push(w.text);
      }
    }

    console.log(`\n年份 "${yearWord.text}" (y=${yearWord.bbox.y0}) 的评分:`);
    console.log(`  同一行有 ${sameLine.length} 个word`);
    console.log(`  匹配月份: ${matchedMonths.join(', ') || '无'}`);
    console.log(`  匹配日期: ${matchedDays.join(', ') || '无'}`);
    console.log(`  得分: ${score}`);

    if (score > bestScore) {
      bestScore = score;
      bestMatch = yearWord;
    }
  }

  console.log(`\n最佳匹配: "${bestMatch?.text}" 得分: ${bestScore} y=${bestMatch?.bbox.y0}`);

  if (!bestMatch) return null;

  const sameLine = ocrResult.words.filter(
    (w) => Math.abs(w.bbox.y0 - bestMatch.bbox.y0) < 30 && Math.abs(w.bbox.y1 - bestMatch.bbox.y1) < 30
  );
  sameLine.sort((a, b) => a.bbox.x0 - b.bbox.x0);

  const dateWords = [];
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

  const result = {
    x: Math.min(...xs) - 4,
    y: Math.min(...ys) - 4,
    width: Math.max(...xEnds) - Math.min(...xs) + 8,
    height: Math.max(...yEnds) - Math.min(...ys) + 8,
  };
  
  console.log(`\n最终框位置: x=${result.x} y=${result.y} w=${result.width} h=${result.height}`);
  console.log(`y值大 = 页面上方, y值小 = 页面下方`);
  console.log(`页面高度: ${pageHeight}, 框的底部y: ${result.y}`);
  
  return result;
}

console.log('=== 测试: 匹配 "02 June 2026" ===');
console.log('期望: 匹配到页面上方的日期 (y大)');
console.log('目标日期: 02 June 2026 (day=02, month=june, year=2026)');

const result = findOcrDatePosition(
  { words: mockWords, text: '' },
  '02 June 2026'
);

console.log('\n=== 结论 ===');
if (result && result.y > 500) {
  console.log('✓ 正确! 框在页面上方 (y > 500)');
} else {
  console.log('✗ 错误! 框不在页面上方 (y <= 500)');
  console.log('问题: 可能匹配到了页面底部的年份');
}
