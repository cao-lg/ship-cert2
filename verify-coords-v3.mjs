// 验证 pdf.js TextItem 的坐标系统
// 目标：确认 transform[5] 和 height 的关系
import * as pdfjsLib from 'pdfjs-dist';

const PDF_PATH = '/workspace/.trae/documents/COF 2026-11-01.pdf';

async function main() {
  const data = await import('fs').then(fs => fs.readFileSync(PDF_PATH));
  const buffer = new Uint8Array(data).buffer;
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;

  console.log(`Total pages: ${pdf.numPages}`);

  // 检查第一页
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 1 });
  console.log(`\nPage 1 viewport (scale=1):`);
  console.log(`  width=${viewport.width}, height=${viewport.height}`);
  console.log(`  transform=${JSON.stringify(viewport.transform)}`);

  const textContent = await page.getTextContent();
  console.log(`\nText items count: ${textContent.items.length}`);

  // 找包含日期的 items
  const dateRe = /(\d{1,2}[-\/.]\d{1,2}[-\/.]\d{2,4}|\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec))/i;

  console.log(`\n=== 所有文本项（前30个）===`);
  for (let i = 0; i < Math.min(30, textContent.items.length); i++) {
    const item = textContent.items[i];
    if (!item.str || !item.str.trim()) continue;
    const t = item.transform;
    console.log(`  [${i}] str="${item.str}"`);
    console.log(`      transform=[${t[0].toFixed(2)}, ${t[1].toFixed(2)}, ${t[2].toFixed(2)}, ${t[3].toFixed(2)}, ${t[4].toFixed(2)}, ${t[5].toFixed(2)}]`);
    console.log(`      x=${t[4].toFixed(2)} y_baseline=${t[5].toFixed(2)} width=${item.width.toFixed(2)} height=${item.height.toFixed(2)}`);
    console.log(`      y_top_if_plus=${(t[5]+item.height).toFixed(2)} y_top_if_minus=${(t[5]-item.height).toFixed(2)}`);
    if (dateRe.test(item.str)) {
      console.log(`      *** 疑似日期 ***`);
    }
  }

  // 找所有包含数字的项（可能是日期）
  console.log(`\n=== 包含数字的文本项（可能是日期）===`);
  for (let i = 0; i < textContent.items.length; i++) {
    const item = textContent.items[i];
    if (!item.str || !/\d/.test(item.str)) continue;
    const t = item.transform;
    console.log(`  [${i}] "${item.str}" x=${t[4].toFixed(2)} y=${t[5].toFixed(2)} w=${item.width.toFixed(2)} h=${item.height.toFixed(2)} fontHeight=${Math.sqrt(t[2]*t[2]+t[3]*t[3]).toFixed(2)}`);
  }
}

main().catch(console.error);
