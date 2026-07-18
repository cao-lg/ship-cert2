import * as pdfjsLib from 'pdfjs-dist';
import { readFileSync, writeFileSync } from 'fs';

const pdfPath = './.trae/documents/COF 2026-11-01.pdf';
const data = new Uint8Array(readFileSync(pdfPath));

const pdf = await pdfjsLib.getDocument({ data }).promise;
console.log(`总页数: ${pdf.numPages}`);

const page = await pdf.getPage(1);
const viewport = page.getViewport({ scale: 1.0 });
console.log(`页面尺寸: ${viewport.width} x ${viewport.height}`);

const textContent = await page.getTextContent();
console.log(`文本项数量: ${textContent.items.length}`);

let meaningfulCount = 0;
const items = [];
for (const item of textContent.items) {
  if (!('str' in item)) continue;
  const str = item.str;
  const transform = item.transform;
  
  if (str.trim().length > 1) meaningfulCount++;
  
  items.push({
    text: str,
    x: transform[4],
    y: transform[5],
    width: item.width || transform[0] * str.length,
    height: Math.abs(transform[3]) || 12,
  });
}

console.log(`有意义文本数: ${meaningfulCount}`);
console.log(`是否图片型: ${meaningfulCount / items.length < 0.3}`);

console.log('\n--- 包含日期的文本项 ---');
const dateItems = items.filter(item => /20\d{2}/.test(item.text));
for (const item of dateItems) {
  console.log(`  "${item.text}"  x:${item.x.toFixed(1)} y:${item.y.toFixed(1)} w:${item.width.toFixed(1)} h:${item.height.toFixed(1)}`);
}

console.log('\n--- 所有文本项（前30个） ---');
items.slice(0, 30).forEach((item, i) => {
  console.log(`${i}: "${item.text}"  x:${item.x.toFixed(1)} y:${item.y.toFixed(1)}`);
});
