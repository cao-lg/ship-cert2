import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createCanvas, Image, ImageData, loadImage } from 'canvas';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createWorker } from 'tesseract.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PDF_PATH = path.join(__dirname, '.trae/documents/COF 2026-11-01.pdf');
const SCALE = 2.0;

global.ImageData = ImageData;
global.Image = Image;

function deviceToUser(vp, dx, dy) {
  const [a, b, c, d, e, f] = vp.transform;
  const det = a * d - b * c;
  if (Math.abs(det) < 1e-10) return [dx, dy];
  const x = (d * (dx - e) - c * (dy - f)) / det;
  const y = (-b * (dx - e) + a * (dy - f)) / det;
  return [x, y];
}

async function renderPageToImage(page, scale) {
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(viewport.width, viewport.height);
  const ctx = canvas.getContext('2d');

  await page.render({
    canvasContext: ctx,
    viewport: viewport,
    canvasFactory: {
      create: (width, height) => {
        const c = createCanvas(width, height);
        return {
          canvas: c,
          context: c.getContext('2d'),
        };
      },
      reset: (canvasAndContext, width, height) => {
        canvasAndContext.canvas.width = width;
        canvasAndContext.canvas.height = height;
      },
      destroy: () => {},
    },
  }).promise;

  return { canvas, viewport };
}

async function main() {
  console.log('='.repeat(80));
  console.log('COF PDF OCR 测试 v2');
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
  const pdf = await pdfjsLib.getDocument({ 
    data: new Uint8Array(fileBuffer),
    disableFontFace: true,
    useSystemFonts: true,
  }).promise;
  console.log(`   页数: ${pdf.numPages}`);
  console.log();

  const pageNum = 1;
  console.log(`2️⃣ 渲染第 ${pageNum} 页 (scale=${SCALE})...`);
  const page = await pdf.getPage(pageNum);
  
  let canvas, viewport;
  try {
    const result = await renderPageToImage(page, SCALE);
    canvas = result.canvas;
    viewport = result.viewport;
  } catch (e) {
    console.log(`   pdfjs渲染失败: ${e.message}`);
    console.log(`   尝试备用方案: 直接提取页面图像...`);
    
    const ops = await page.getOperatorList();
    console.log(`   操作列表长度: ${ops.argsArray.length}`);
    
    throw e;
  }
  
  console.log(`   视口尺寸: ${viewport.width.toFixed(0)} x ${viewport.height.toFixed(0)} px`);
  console.log(`   页面尺寸: ${viewport.width / SCALE} x ${viewport.height / SCALE} pt`);
  console.log(`   变换矩阵: [${viewport.transform.join(', ')}]`);
  console.log(`   渲染完成`);
  console.log();

  console.log('3️⃣ OCR识别...');
  const worker = await createWorker('eng');
  
  const canvasBuffer = canvas.toBuffer('image/png');
  const result = await worker.recognize(canvasBuffer);
  
  console.log(`   OCR文本长度: ${result.data.text.length}`);
  console.log(`   OCR words数量: ${result.data.words ? result.data.words.length : 0}`);
  console.log();

  console.log('4️⃣ OCR原始文本（前800字符）:');
  console.log('-' .repeat(60));
  console.log(result.data.text.substring(0, 800));
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
  console.log(`   找到 ${yearWords.length} 个包含年份的词`);
  yearWords.slice(0, 20).forEach((w, i) => {
    console.log(`   ${i + 1}. "${w.text}" (conf: ${w.confidence.toFixed(0)}%)`);
    console.log(`      bbox: (${w.bbox.x0.toFixed(1)}, ${w.bbox.y0.toFixed(1)}) - (${w.bbox.x1.toFixed(1)}, ${w.bbox.y1.toFixed(1)})`);
  });
  if (yearWords.length > 20) {
    console.log(`   ... 还有 ${yearWords.length - 20} 个`);
  }
  console.log();

  console.log('7️⃣ 所有数字格式日期:');
  const dateLikeWords = convertedWords.filter(w => /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}\-\d{1,2}\-\d{1,2}/.test(w.text));
  if (dateLikeWords.length === 0) {
    console.log('   （未找到纯数字格式的日期词）');
  } else {
    dateLikeWords.forEach((w, i) => {
      console.log(`   ${i + 1}. "${w.text}" @ (${w.bbox.x0.toFixed(1)}, ${w.bbox.y0.toFixed(1)})`);
    });
  }
  console.log();

  console.log('8️⃣ 前50个OCR词预览:');
  convertedWords.slice(0, 50).forEach((w, i) => {
    console.log(`   ${String(i + 1).padStart(2, ' ')}. "${w.text}" @ (${w.bbox.x0.toFixed(1)}, ${w.bbox.y0.toFixed(1)})`);
  });

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
