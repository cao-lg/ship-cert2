import { readFileSync } from 'fs';
import * as pdfjsLib from 'pdfjs-dist';
import { createCanvas } from 'canvas';
import { createWorker } from 'tesseract.js';
import { buildLines, findDateGroups, recognizeDatesFromUnified, normSp } from './src/utils/dateRecognizer';

global.ImageData = createCanvas(1, 1).constructor.ImageData;
global.Image = createCanvas(1, 1).constructor.Image;

const PDF_PATH = '/workspace/.trae/documents/ISSC 2028-05-12.pdf';

async function main() {
  console.log('=== ISSC PDF 详细调试 ===\n');

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
    text: string;
    blocks?: Array<{
      paragraphs?: Array<{
        lines?: Array<{
          words?: Array<{ text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } }>;
        }>;
      }>;
    }>;
  };

  console.log('\n3. 提取OCR文本（完整）:');
  console.log(ocrData.text);

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

  console.log('\n4. 构建行:');
  const { lines } = buildLines(words);
  
  console.log(`   总行数: ${lines.length}`);
  
  console.log('\n   包含日期的行:');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].text.match(/\d{4}/)) {
      console.log(`   [${i}] "${lines[i].text}"`);
      console.log(`       items:`, lines[i].items.map(it => `"${it.str}"`));
    }
  }

  console.log('\n5. 逐行查找日期:');
  for (let i = 0; i < lines.length; i++) {
    const dgs = findDateGroups(lines[i].items);
    if (dgs.length > 0) {
      console.log(`   行${i}: 找到 ${dgs.length} 个日期:`);
      for (const dg of dgs) {
        console.log(`      ${dg.iso} (x0=${dg.x0.toFixed(0)}, x1=${dg.x1.toFixed(0)}, yTop=${dg.yTop.toFixed(0)}, yBot=${dg.yBot.toFixed(0)})`);
      }
    }
  }

  console.log('\n6. 识别日期类型（详细日志）:');
  const dates = recognizeDatesFromUnified(words, 0.7);
  
  console.log(`\n识别到 ${dates.length} 个日期:`);
  for (const d of dates) {
    console.log(`   类型: ${d.type}, 日期: ${d.date}, 置信度: ${(d.confidence*100).toFixed(0)}%`);
    console.log(`         位置: x=${d.position.x.toFixed(0)}, y=${d.position.y.toFixed(0)}, w=${d.position.width.toFixed(0)}, h=${d.position.height.toFixed(0)}`);
  }

  console.log('\n7. 检查"valid until"关键词:');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].text.toLowerCase().includes('valid until')) {
      console.log(`   行${i}: "${lines[i].text}"`);
    }
  }

  console.log('\n=== 调试完成 ===');
}

main().catch(console.error);
