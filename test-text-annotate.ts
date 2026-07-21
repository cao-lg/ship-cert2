import { readFileSync, writeFileSync } from 'fs';
import { PDFDocument, rgb } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import { createCanvas, createImageData } from 'canvas';
import { recognizeDatesFromUnified } from './src/utils/dateRecognizer';

pdfjsLib.GlobalWorkerOptions.workerSrc = '/workspace/node_modules/pdfjs-dist/build/pdf.worker.mjs';

global.ImageData = createImageData;
global.Image = createCanvas(1, 1).constructor.Image;

const PDF_PATH = '/workspace/.trae/documents/ISSC 2028-05-12.pdf';
const OUTPUT_PATH = '/workspace/test-annotated.pdf';

async function main() {
  console.log('=== 测试文本型PDF标注 ===\n');

  const data = readFileSync(PDF_PATH);
  const buffer = new Uint8Array(data).buffer;

  console.log('1. 解析PDF...');
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const page = await pdf.getPage(1);
  const textContent = await page.getTextContent();
  
  const allItems: Array<{ str: string; x0: number; y: number; width: number; height: number; page: number }> = [];
  let meaningfulCount = 0;
  
  for (const item of textContent.items as any[]) {
    if (!('str' in item)) continue;
    const str = item.str;
    if (str.trim().length > 1) meaningfulCount++;
    
    const transform = item.transform;
    const itemHeight = Math.abs(transform[3]) || 12;
    const itemWidth = item.width || Math.abs(transform[0] * str.length) || str.length * 8;
    
    allItems.push({
      str,
      x0: transform[4],
      y: transform[5] + itemHeight,
      width: itemWidth,
      height: itemHeight,
      page: 1,
    });
  }
  
  console.log(`   文本项: ${textContent.items.length}, 有意义: ${meaningfulCount}`);
  console.log(`   文本型: ${meaningfulCount / textContent.items.length >= 0.3}`);

  console.log('\n2. 识别日期...');
  const dates = recognizeDatesFromUnified(allItems, 0.85);
  console.log(`   识别到 ${dates.length} 个日期:`);
  for (const d of dates) {
    console.log(`   - ${d.type}: ${d.date} (page=${d.page}, conf=${(d.confidence*100).toFixed(0)}%)`);
    console.log(`     position: x=${d.position.x.toFixed(1)}, y=${d.position.y.toFixed(1)}, w=${d.position.width.toFixed(1)}, h=${d.position.height.toFixed(1)}`);
  }

  const datesToAnnotate = dates.filter(d => d.type === 'EXPIRY' || d.type === 'ANNUAL_SURVEY');
  console.log(`\n   需要标注的日期: ${datesToAnnotate.length} 个`);

  console.log('\n3. 标注PDF...');
  const pdfDoc = await PDFDocument.load(data);
  const pages = pdfDoc.getPages();
  console.log(`   PDF页数: ${pages.length}`);

  for (const dateInfo of datesToAnnotate) {
    const pageIndex = dateInfo.page - 1;
    if (pageIndex < 0 || pageIndex >= pages.length) continue;

    const page = pages[pageIndex];
    const pos = dateInfo.position;
    const { width: pw, height: ph } = page.getSize();

    console.log(`   页面 ${pageIndex + 1} 尺寸: ${pw.toFixed(1)} x ${ph.toFixed(1)}`);
    console.log(`   标注位置: x=${pos.x.toFixed(1)}, y=${pos.y.toFixed(1)}, w=${pos.width.toFixed(1)}, h=${pos.height.toFixed(1)}`);
    console.log(`   是否在页面内: x=${pos.x >= 0 && pos.x < pw}, y=${pos.y >= 0 && pos.y < ph}`);

    const pad = 4;
    const x = pos.x - pad;
    const y = pos.y - pad;
    const width = Math.max(pos.width, 20) + pad * 2;
    const heightRect = Math.max(pos.height, 10) + pad * 2;

    const xClamped = Math.max(0, Math.min(x, pw));
    const yClamped = Math.max(0, Math.min(y, ph));
    const wClamped = Math.min(width, pw - xClamped);
    const hClamped = Math.min(heightRect, ph - yClamped);

    console.log(`   实际绘制: x=${xClamped.toFixed(1)}, y=${yClamped.toFixed(1)}, w=${wClamped.toFixed(1)}, h=${hClamped.toFixed(1)}`);

    page.drawRectangle({
      x: xClamped,
      y: yClamped,
      width: wClamped,
      height: hClamped,
      borderColor: rgb(1, 0, 0),
      borderWidth: 3,
      opacity: 0,
      borderOpacity: 1,
    });
    console.log('   ✓ 已绘制矩形');
  }

  const annotatedBytes = await pdfDoc.save();
  writeFileSync(OUTPUT_PATH, annotatedBytes);
  console.log(`\n4. 已保存到: ${OUTPUT_PATH}`);
  console.log(`   文件大小: ${annotatedBytes.length} 字节`);

  console.log('\n=== 测试完成 ===');
}

main().catch(console.error);
