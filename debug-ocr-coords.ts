import { readFileSync } from 'fs';
import * as pdfjsLib from 'pdfjs-dist';
import { createCanvas, createImageData } from 'canvas';
import { createWorker } from 'tesseract.js';

global.ImageData = createImageData;
global.Image = createCanvas(1, 1).constructor.Image;

const PDF_PATH = '/workspace/.trae/documents/ISSC 2028-05-12.pdf';

async function main() {
  console.log('=== OCR坐标调试 ===\n');

  const data = readFileSync(PDF_PATH);
  const buffer = new Uint8Array(data).buffer;

  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const page = await pdf.getPage(1);
  
  const scale = 5.0;
  const viewport = page.getViewport({ scale });
  console.log(`设备空间尺寸: ${viewport.width.toFixed(0)} x ${viewport.height.toFixed(0)}`);
  
  const origViewport = page.getViewport({ scale: 1.0 });
  console.log(`用户空间尺寸: ${origViewport.width.toFixed(1)} x ${origViewport.height.toFixed(1)}`);

  const canvas = createCanvas(viewport.width, viewport.height);
  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport }).promise;

  const worker = await createWorker('eng');
  const result = await worker.recognize(canvas, {}, { blocks: true });
  const ocrData = result.data as any;

  const vpHeight = viewport.height;
  const deviceToUserY = (dy: number) => vpHeight - dy;

  console.log('\n=== OCR识别到的词（含日期）===');
  let totalWords = 0;
  const dateWords: any[] = [];

  if (ocrData.blocks && ocrData.blocks.length > 0) {
    for (const block of ocrData.blocks) {
      if (block.paragraphs) {
        for (const para of block.paragraphs) {
          if (para.lines) {
            for (const line of para.lines) {
              if (line.words) {
                for (const w of line.words) {
                  totalWords++;
                  
                  const dx0 = w.bbox.x0 / scale;
                  const dx1 = w.bbox.x1 / scale;
                  const dy0 = w.bbox.y0 / scale;
                  const dy1 = w.bbox.y1 / scale;
                  
                  const userY0 = deviceToUserY(dy1);
                  const userY1 = deviceToUserY(dy0);
                  
                  if (w.text.match(/\d{4}/) || w.text.match(/^(January|February|March|April|May|June|July|August|September|October|November|December)$/i)) {
                    dateWords.push({
                      text: w.text,
                      deviceX: (w.bbox.x0 + w.bbox.x1) / 2,
                      deviceY: (w.bbox.y0 + w.bbox.y1) / 2,
                      userX: (dx0 + dx1) / 2,
                      userY0,
                      userY1,
                      userYCenter: (userY0 + userY1) / 2,
                    });
                    
                    console.log(`  "${w.text}"`);
                    console.log(`    设备空间: x=${w.bbox.x0.toFixed(0)}-${w.bbox.x1.toFixed(0)}, y=${w.bbox.y0.toFixed(0)}-${w.bbox.y1.toFixed(0)}`);
                    console.log(`    用户空间: x=${dx0.toFixed(1)}-${dx1.toFixed(1)}, y0=${userY0.toFixed(1)}, y1=${userY1.toFixed(1)}`);
                    console.log(`    用户空间中心: y=${((userY0 + userY1) / 2).toFixed(1)}`);
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  console.log(`\n总词数: ${totalWords}`);
  console.log(`日期相关词数: ${dateWords.length}`);

  console.log('\n=== 用户空间Y坐标排序 ===');
  dateWords.sort((a, b) => a.userYCenter - b.userYCenter);
  for (const w of dateWords) {
    console.log(`  y=${w.userYCenter.toFixed(1)}: "${w.text}"`);
  }

  console.log('\n=== annotateImagePdf 中的坐标计算 ===');
  for (const w of dateWords) {
    const annotScale = 2.0;
    const pageHeightPx = origViewport.height * annotScale;
    const x = w.userX * annotScale;
    const ww = (dx1 - dx0) * annotScale;
    const hh = (userY1 - userY0) * annotScale;
    const y = pageHeightPx - w.userY1 * annotScale;
    
    console.log(`  "${w.text}"`);
    console.log(`    Canvas绘制: x=${x.toFixed(0)}, y=${y.toFixed(0)}, w=${ww.toFixed(0)}, h=${hh.toFixed(0)}`);
    console.log(`    页面高度: ${pageHeightPx.toFixed(0)}`);
    console.log(`    用户空间顶部y: ${w.userY1.toFixed(1)}`);
  }

  await worker.terminate();
}

main().catch(console.error);
