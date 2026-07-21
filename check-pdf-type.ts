import { readFileSync } from 'fs';
import * as pdfjsLib from 'pdfjs-dist';
import { createCanvas, createImageData } from 'canvas';

global.ImageData = createImageData;
global.Image = createCanvas(1, 1).constructor.Image;

const PDF_PATH = '/workspace/.trae/documents/ISSC 2028-05-12.pdf';

async function main() {
  const data = readFileSync(PDF_PATH);
  const buffer = new Uint8Array(data).buffer;
  
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const page = await pdf.getPage(1);
  const textContent = await page.getTextContent();
  
  console.log('文本项数量:', textContent.items.length);
  
  let meaningful = 0;
  for (const item of textContent.items as any[]) {
    if (item.str && item.str.trim().length > 1) {
      meaningful++;
    }
  }
  
  console.log('有意义文本项:', meaningful);
  console.log('文本占比:', (meaningful / textContent.items.length * 100).toFixed(1) + '%');
  console.log('是否图片型:', meaningful / textContent.items.length < 0.3);
  
  const viewport = page.getViewport({ scale: 1.0 });
  console.log('\n页面尺寸:', viewport.width.toFixed(1), 'x', viewport.height.toFixed(1));
  
  if (textContent.items.length > 0) {
    console.log('\n前10个文本项:');
    for (let i = 0; i < Math.min(10, textContent.items.length); i++) {
      const item = textContent.items[i] as any;
      console.log(`  [${i}] "${item.str}" x=${item.transform[4].toFixed(1)}, y=${item.transform[5].toFixed(1)}`);
    }
  }
}

main().catch(console.error);
