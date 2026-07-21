import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createCanvas, createImageData, ImageData } from 'canvas';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createWorker } from 'tesseract.js';

global.ImageData = ImageData;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PDF_PATH = path.join(__dirname, '.trae/documents/COF 2026-11-01.pdf');
const SCALE = 3.0;

function deviceToUser(vp, dx, dy) {
  const [a, b, c, d, e, f] = vp.transform;
  const det = a * d - b * c;
  if (Math.abs(det) < 1e-10) return [dx, dy];
  const x = (d * (dx - e) - c * (dy - f)) / det;
  const y = (-b * (dx - e) + a * (dy - f)) / det;
  return [x, y];
}

function cleanWord(s) {
  return s.replace(/[\(\)\.,;:]/g, '').trim().toLowerCase();
}

function findOcrDatePosition(words, matchedText) {
  const normalized = matchedText.toLowerCase().trim();

  const datePattern = /(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[\.,]?\s+(\d{4})/i;
  const datePattern2 = /(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{4})/;
  const datePattern3 = /(\d{4})-(\d{1,2})-(\d{1,2})/;
  const datePattern4 = /(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),?\s+(\d{4})/i;

  let day = '';
  let month = '';
  let year = '';
  let isNumericMonth = false;
  let monthBeforeDay = false;

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
      isNumericMonth = true;
    } else {
      const m3 = normalized.match(datePattern3);
      if (m3) {
        year = m3[1];
        month = m3[2];
        day = m3[3];
        isNumericMonth = true;
      } else {
        const m4 = normalized.match(datePattern4);
        if (m4) {
          month = m4[1].toLowerCase();
          day = m4[2];
          year = m4[3];
          monthBeforeDay = true;
        }
      }
    }
  }

  if (!year) {
    console.log('  [findOcrDatePosition] 未解析到年份');
    return null;
  }

  console.log(`  [findOcrDatePosition] 解析日期: day=${day}, month=${month}, year=${year}, numeric=${isNumericMonth}`);

  const monthFullNames = [
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december',
  ];
  const monthAbbrNames = [
    'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
  ];

  const isMonthWord = (wordText) => {
    const clean = cleanWord(wordText);
    if (!month) return false;
    
    if (isNumericMonth) {
      return clean === month || clean === month.padStart(2, '0');
    } else {
      const monthLower = month.toLowerCase();
      if (monthLower === clean) return true;
      if (monthFullNames.some(m => m.startsWith(monthLower) && clean.startsWith(monthLower.substring(0, 3)))) return true;
      if (monthAbbrNames.some(m => m === monthLower.substring(0, 3) && clean.startsWith(m))) return true;
      return false;
    }
  };

  const isDayWord = (wordText) => {
    if (!day) return false;
    const clean = cleanWord(wordText);
    return clean === day || clean === day.padStart(2, '0');
  };

  const yearCandidates = words.filter((w) => {
    const clean = cleanWord(w.text);
    return clean === year || clean.includes(year);
  });

  console.log(`  [findOcrDatePosition] 年份候选词数量: ${yearCandidates.length}`);
  yearCandidates.forEach((w, i) => {
    console.log(`    ${i + 1}. "${w.text}" @ (${w.bbox.x0.toFixed(1)}, ${w.bbox.y0.toFixed(1)}) - (${w.bbox.x1.toFixed(1)}, ${w.bbox.y1.toFixed(1)})`);
  });

  if (yearCandidates.length === 0) return null;

  let bestResult = null;
  let bestScore = 0;

  for (const yearWord of yearCandidates) {
    const yearCenterY = (yearWord.bbox.y0 + yearWord.bbox.y1) / 2;
    const yearHeight = yearWord.bbox.y1 - yearWord.bbox.y0;
    const yThreshold = Math.max(yearHeight * 2, 20);
    const xThreshold = Math.max(yearHeight * 8, 100);

    const nearbyWords = words.filter((w) => {
      const wCenterY = (w.bbox.y0 + w.bbox.y1) / 2;
      const wCenterX = (w.bbox.x0 + w.bbox.x1) / 2;
      const yearCenterX = (yearWord.bbox.x0 + yearWord.bbox.x1) / 2;
      return Math.abs(wCenterY - yearCenterY) < yThreshold &&
             Math.abs(wCenterX - yearCenterX) < xThreshold;
    });

    nearbyWords.sort((a, b) => a.bbox.x0 - b.bbox.x0);

    let hasMonth = false;
    let hasDay = false;
    const dateComponentWords = [yearWord];

    for (const w of nearbyWords) {
      if (w === yearWord) continue;
      if (isMonthWord(w.text)) {
        hasMonth = true;
        dateComponentWords.push(w);
        console.log(`    找到月份词: "${w.text}"`);
      }
      if (isDayWord(w.text)) {
        hasDay = true;
        dateComponentWords.push(w);
        console.log(`    找到日期词: "${w.text}"`);
      }
    }

    let score = 1;
    if (hasMonth) score += 3;
    if (hasDay) score += 2;

    console.log(`    得分: ${score} (年份=1, 月份+3, 日期+2)`);

    if (score > bestScore && score >= 3) {
      bestScore = score;
      
      const xs = dateComponentWords.map(w => w.bbox.x0);
      const xEnds = dateComponentWords.map(w => w.bbox.x1);
      const ys = dateComponentWords.map(w => w.bbox.y0);
      const yEnds = dateComponentWords.map(w => w.bbox.y1);
      
      const pad = 4;
      bestResult = {
        x: Math.min(...xs) - pad,
        y: Math.min(...ys) - pad,
        width: Math.max(...xEnds) - Math.min(...xs) + pad * 2,
        height: Math.max(...yEnds) - Math.min(...ys) + pad * 2,
      };
    }
  }

  if (bestResult) {
    console.log(`  [findOcrDatePosition] 最佳结果: x=${bestResult.x.toFixed(1)}, y=${bestResult.y.toFixed(1)}, w=${bestResult.width.toFixed(1)}, h=${bestResult.height.toFixed(1)}, score=${bestScore}`);
  } else {
    console.log(`  [findOcrDatePosition] 未找到匹配位置`);
  }

  return bestResult;
}

async function main() {
  console.log('='.repeat(80));
  console.log('COF PDF OCR 测试');
  console.log('='.repeat(80));
  console.log();

  if (!fs.existsSync(PDF_PATH)) {
    console.error(`❌ PDF文件不存在: ${PDF_PATH}`);
    process.exit(1);
  }

  const fileBuffer = fs.readFileSync(PDF_PATH);
  console.log(`📄 文件大小: ${(fileBuffer.length / 1024).toFixed(1)} KB`);
  console.log();

  console.log('1️⃣ 加载PDF...');
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(fileBuffer) }).promise;
  console.log(`   页数: ${pdf.numPages}`);
  console.log();

  const pageNum = 1;
  console.log(`2️⃣ 渲染第 ${pageNum} 页 (scale=${SCALE})...`);
  const page = await pdf.getPage(pageNum);
  const viewport = page.getViewport({ scale: SCALE });
  
  console.log(`   视口尺寸: ${viewport.width.toFixed(0)} x ${viewport.height.toFixed(0)} px`);
  console.log(`   页面尺寸: ${viewport.width / SCALE} x ${viewport.height / SCALE} pt`);
  console.log(`   变换矩阵: [${viewport.transform.join(', ')}]`);
  
  const canvas = createCanvas(viewport.width, viewport.height);
  const ctx = canvas.getContext('2d');
  
  await page.render({
    canvasContext: ctx,
    viewport: viewport,
  }).promise;
  
  console.log(`   渲染完成`);
  console.log();

  console.log('3️⃣ OCR识别...');
  const worker = await createWorker('eng');
  
  const canvasBuffer = canvas.toBuffer('image/png');
  const result = await worker.recognize(canvasBuffer);
  
  console.log(`   OCR文本长度: ${result.data.text.length}`);
  console.log(`   OCR words数量: ${result.data.words ? result.data.words.length : 0}`);
  console.log();

  console.log('4️⃣ OCR原始文本（前500字符）:');
  console.log('-' .repeat(60));
  console.log(result.data.text.substring(0, 500));
  console.log('-' .repeat(60));
  console.log();

  const ocrWords = result.data.words || [];
  console.log('5️⃣ 转换OCR坐标到PDF用户空间...');
  
  const convertedWords = [];
  for (const w of ocrWords) {
    const dx0 = w.bbox.x0 / SCALE;
    const dx1 = w.bbox.x1 / SCALE;
    const dyTop = w.bbox.y0 / SCALE;
    const dyBot = w.bbox.y1 / SCALE;
    
    const pts = [
      [dx0, dyTop], [dx1, dyTop], [dx0, dyBot], [dx1, dyBot]
    ].map(([dx, dy]) => deviceToUser(viewport, dx, dy));
    
    const uxs = pts.map((p) => p[0]);
    const uys = pts.map((p) => p[1]);
    
    convertedWords.push({
      text: w.text,
      confidence: w.confidence,
      bbox: {
        x0: Math.min(...uxs),
        y0: Math.min(...uys),
        x1: Math.max(...uxs),
        y1: Math.max(...uys),
      },
    });
  }
  
  console.log(`   已转换 ${convertedWords.length} 个词的坐标`);
  console.log();

  console.log('6️⃣ 显示包含年份的词（2024/2025/2026）:');
  const yearWords = convertedWords.filter(w => /20(24|25|26)/.test(w.text));
  yearWords.forEach((w, i) => {
    console.log(`   ${i + 1}. "${w.text}" (conf: ${w.confidence.toFixed(0)}%)`);
    console.log(`      bbox: (${w.bbox.x0.toFixed(1)}, ${w.bbox.y0.toFixed(1)}) - (${w.bbox.x1.toFixed(1)}, ${w.bbox.y1.toFixed(1)})`);
    console.log(`      尺寸: ${(w.bbox.x1 - w.bbox.x0).toFixed(1)} x ${(w.bbox.y1 - w.bbox.y0).toFixed(1)} pt`);
  });
  console.log();

  console.log('7️⃣ 测试日期位置匹配:');
  const testDates = [
    '1 November 2026',
    '01 November 2026',
    '1 Nov 2026',
    'November 1, 2026',
    '01/11/2026',
    '1/11/2026',
    '2026-11-01',
  ];

  for (const testDate of testDates) {
    console.log(`\n  测试: "${testDate}"`);
    const pos = findOcrDatePosition(convertedWords, testDate);
    if (pos) {
      console.log(`  ✅ 找到位置: x=${pos.x.toFixed(1)}, y=${pos.y.toFixed(1)}, w=${pos.width.toFixed(1)}, h=${pos.height.toFixed(1)}`);
    } else {
      console.log(`  ❌ 未找到位置`);
    }
  }

  console.log();
  console.log('8️⃣ 所有包含日期格式的词:');
  const dateLikeWords = convertedWords.filter(w => /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}\-\d{1,2}\-\d{1,2}/.test(w.text));
  if (dateLikeWords.length === 0) {
    console.log('   （未找到纯数字格式的日期词）');
  } else {
    dateLikeWords.forEach((w, i) => {
      console.log(`   ${i + 1}. "${w.text}" @ (${w.bbox.x0.toFixed(1)}, ${w.bbox.y0.toFixed(1)})`);
    });
  }

  await worker.terminate();
  
  console.log();
  console.log('='.repeat(80));
  console.log('测试完成');
  console.log('='.repeat(80));
}

main().catch(err => {
  console.error('测试失败:', err);
  process.exit(1);
});
