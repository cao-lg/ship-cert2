import * as pdfjsLib from 'pdfjs-dist';
import { readFileSync } from 'fs';

pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdfjs-dist/build/pdf.worker.mjs';

const filePath = process.argv[2] || '/workspace/.trae/documents/TON 2026-01-13.pdf';
console.log('测试文件:', filePath);

async function main() {
  const data = new Uint8Array(readFileSync(filePath));
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const pageCount = pdf.numPages;
  console.log('页数:', pageCount);

  const allItems = [];

  for (let pageNum = 1; pageNum <= Math.min(pageCount, 1); pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.0 });
    const textContent = await page.getTextContent();
    const pageHeight = viewport.height;

    console.log(`\n第${pageNum}页，高度: ${pageHeight}`);
    console.log(`文本项数量: ${textContent.items.length}`);

    let count = 0;
    for (const item of textContent.items) {
      if (!('str' in item)) continue;
      const str = item.str;
      const transform = item.transform;
      
      const itemHeight = Math.abs(transform[3]) || 12;
      const rawWidth = item.width;
      const itemWidth = rawWidth || Math.abs(transform[0] * str.length) || str.length * 8;

      const textItem = {
        text: str,
        x: transform[4],
        y: transform[5],
        width: itemWidth,
        height: itemHeight,
        page: pageNum,
      };
      allItems.push(textItem);

      if (count < 20 || str.match(/January|2026|13|May|2031|28|29|2026/i)) {
        console.log(`  "${str}" x=${transform[4].toFixed(2)}, y=${transform[5].toFixed(2)}, w=${itemWidth.toFixed(2)}, h=${itemHeight.toFixed(2)}`);
      }
      count++;
    }
  }

  const dateItems = allItems.filter(i => 
    i.text.match(/^\d{4}$/) || 
    i.text.match(/^\d{1,2}$/) || 
    i.text.match(/^(January|February|March|April|May|June|July|August|September|October|November|December)$/i) ||
    i.text.match(/^(Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/i)
  );

  console.log('\n\n日期相关词:', dateItems.length);
  for (const item of dateItems) {
    console.log(`  "${item.text}" x=${item.x.toFixed(2)}, y=${item.y.toFixed(2)}, h=${item.height.toFixed(2)}, page=${item.page}`);
  }

  const sorted = [...allItems].sort((a, b) => a.y - b.y || a.x - b.x);
  const lines = [];
  let cur = null;
  let curY = null;

  for (const it of sorted) {
    if (cur === null || Math.abs(it.y - curY) > 4) {
      cur = [];
      curY = it.y;
      lines.push({ items: cur, text: '' });
    }
    cur.push(it);
  }

  for (const line of lines) {
    line.items.sort((a, b) => a.x - b.x);
    line.text = line.items.map(i => i.text).join(' ');
  }

  lines.reverse();

  console.log('\n\n行（从上到下）:');
  for (let i = 0; i < Math.min(lines.length, 30); i++) {
    const line = lines[i];
    if (line.text.match(/January|May|2026|2031|valid|issued/i)) {
      console.log(`  行${i}: "${line.text}"`);
      for (const item of line.items) {
        if (item.text.match(/^\d{1,2}$|^\d{4}$|January|May|June/i)) {
          console.log(`    "${item.text}" x=${item.x.toFixed(2)}, y=${item.y.toFixed(2)}, h=${item.height.toFixed(2)}`);
        }
      }
    }
  }
}

main().catch(console.error);
