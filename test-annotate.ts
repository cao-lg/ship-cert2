import { readFileSync, writeFileSync } from 'fs';
import { createCanvas, createImageData } from 'canvas';
import * as pdfjsLib from 'pdfjs-dist';
import { createWorker } from 'tesseract.js';
import { recognizeDatesFromOcr } from './src/utils/dateRecognizer';
import { annotateImagePdf } from './src/utils/pdfAnnotator';

global.ImageData = createImageData;
global.Image = createCanvas(1, 1).constructor.Image;
global.document = {
  createElement: (tag: string) => {
    if (tag === 'canvas') return createCanvas(1, 1);
    return {} as any;
  }
};

const PDF_PATH = '/workspace/.trae/documents/ISSC 2026-12-01.pdf';

async function main() {
  console.log('=== 测试图片型PDF标注 ===\n');

  const data = readFileSync(PDF_PATH);
  const buffer = new Uint8Array(data).buffer;

  console.log('1. 解析PDF...');
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const page = await pdf.getPage(1);
  const scale = 5.0;
  const viewport = page.getViewport({ scale });
  console.log(`   页面尺寸: ${viewport.width.toFixed(0)} x ${viewport.height.toFixed(0)} (scale=${scale})`);

  console.log('\n2. OCR识别...');
  const canvas = createCanvas(viewport.width, viewport.height);
  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport }).promise;

  const worker = await createWorker('eng');
  const result = await worker.recognize(canvas, {}, { blocks: true });
  
  const ocrData = result.data as any;
  const words: any[] = [];
  
  const vpHeight = viewport.height;
  const deviceToUserY = (dy: number) => vpHeight - dy;

  if (ocrData.blocks && ocrData.blocks.length > 0) {
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
                    text: w.text,
                    confidence: w.confidence / 100,
                    bbox: {
                      x0: dx0,
                      y0: deviceToUserY(dy1),
                      x1: dx1,
                      y1: deviceToUserY(dy0),
                    },
                  });
                }
              }
            }
          }
        }
      }
    }
  }

  console.log(`   识别到 ${words.length} 个词`);

  console.log('\n3. 识别日期...');
  const dates = recognizeDatesFromOcr([{
    text: ocrData.text,
    words,
    scale,
  }]);
  
  console.log(`   识别到 ${dates.length} 个日期:`);
  for (const d of dates) {
    console.log(`   - ${d.type}: ${d.date} (page=${d.page}, conf=${(d.confidence*100).toFixed(0)}%)`);
    console.log(`     position: x=${d.position.x.toFixed(1)}, y=${d.position.y.toFixed(1)}, w=${d.position.width.toFixed(1)}, h=${d.position.height.toFixed(1)}`);
  }

  const datesToAnnotate = dates.filter(d => d.type === 'EXPIRY' || d.type === 'ANNUAL_SURVEY');
  console.log(`\n   需要标注的日期: ${datesToAnnotate.length} 个`);

  console.log('\n4. 测试标注函数...');
  console.log('   注意: 完整的annotateImagePdf需要浏览器环境，这里只检查坐标计算');
  
  for (const d of datesToAnnotate) {
    const pos = d.position;
    const annotScale = 2.0;
    
    const origViewport = page.getViewport({ scale: 1.0 });
    const pageHeightPt = origViewport.height;
    
    console.log(`   日期 ${d.date} (${d.type}):`);
    console.log(`     用户空间坐标: x=${pos.x.toFixed(1)}, y=${pos.y.toFixed(1)}, w=${pos.width.toFixed(1)}, h=${pos.height.toFixed(1)}`);
    console.log(`     页面高度: ${pageHeightPt.toFixed(1)} pt`);
    
    const xPx = pos.x * annotScale;
    const yTopPx = pageHeightPt - (pos.y + pos.height);
    const yPx = yTopPx * annotScale;
    const wPx = pos.width * annotScale;
    const hPx = pos.height * annotScale;
    
    console.log(`     渲染坐标(scale=${annotScale}): x=${xPx.toFixed(0)}, y=${yPx.toFixed(0)}, w=${wPx.toFixed(0)}, h=${hPx.toFixed(0)}`);
    console.log(`     画布高度: ${(viewport.height * annotScale / scale).toFixed(0)} px`);
  }

  console.log('\n=== 测试完成 ===');
  await worker.terminate();
}

main().catch(console.error);
