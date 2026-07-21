import { readFileSync } from 'fs';
import * as pdfjsLib from 'pdfjs-dist';
import { createCanvas } from 'canvas';
import { createWorker } from 'tesseract.js';
import { recognizeDatesFromUnified, buildLines } from './src/utils/dateRecognizer';

const PDF_PATH = '/workspace/.trae/documents/ISSC 2028-05-12.pdf';

async function main() {
  console.log('=== ISSC PDF 端到端测试 ===\n');

  const data = readFileSync(PDF_PATH);
  const buffer = new Uint8Array(data).buffer;
  
  console.log('1. 解析PDF...');
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const page = await pdf.getPage(1);
  const scale = 5.0;
  const viewport = page.getViewport({ scale });
  
  console.log(`   页面尺寸: ${viewport.width.toFixed(0)} x ${viewport.height.toFixed(0)}`);

  const c = createCanvas(viewport.width, viewport.height);
  const ctx = c.getContext('2d');
  
  await page.render({ canvasContext: ctx, viewport }).promise;

  console.log('\n2. OCR识别...');
  const worker = await createWorker('eng');
  const result = await worker.recognize(c, {}, { blocks: true });
  await worker.terminate();

  const ocrData = result.data as unknown as {
    blocks?: Array<{
      paragraphs?: Array<{
        lines?: Array<{
          words?: Array<{ text: string; bbox: { x0: number; y0: number; x1: number; y1: number } }>;
        }>;
      }>;
    }>;
  };

  const vpHeight = viewport.height;
  const deviceToUserY = (dy: number) => vpHeight - dy;
  
  const words: Array<{ str: string; x0: number; y: number; width: number; height: number; page: number }> = [];
  
  if (ocrData.blocks) {
    for (const block of ocrData.blocks) {
      if (block.paragraphs) {
        for (const para of block.paragraphs) {
          if (para.lines) {
            for (const line of para.lines) {
              if (line.words) {
                for (const w of line.words) {
                  const dx0 = w.bbox.x0 / scale;
                  const dx1 = w.bbox.x1 / scale;
                  const dy0 = w.bbox.y0 / scale;
                  const dy1 = w.bbox.y1 / scale;
                  
                  words.push({
                    str: w.text,
                    x0: dx0,
                    y: deviceToUserY(dy1),
                    width: dx1 - dx0,
                    height: dy1 - dy0,
                    page: 1,
                  });
                }
              }
            }
          }
        }
      }
    }
  }

  console.log('\n3. 构建行（验证行顺序）:');
  const { lines } = buildLines(words);
  
  console.log(`   总行数: ${lines.length}`);
  console.log('\n   前5行（应该是页面顶部）:');
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    console.log(`   [${i}] ${lines[i].text.substring(0, 100)}`);
  }
  
  console.log('\n   包含日期的行:');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].text.match(/\d{4}/)) {
      console.log(`   [${i}] ${lines[i].text}`);
    }
  }

  console.log('\n4. 识别日期:');
  const dates = recognizeDatesFromUnified(words, 0.7);
  
  console.log(`\n识别到 ${dates.length} 个日期:`);
  for (const d of dates) {
    console.log(`   类型: ${d.type}, 日期: ${d.date}, 置信度: ${(d.confidence*100).toFixed(0)}%`);
    console.log(`         位置: x=${d.position.x.toFixed(0)}, y=${d.position.y.toFixed(0)}`);
  }

  console.log('\n=== 测试完成 ===');
}

main().catch(console.error);
