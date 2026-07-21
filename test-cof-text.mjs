import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PDF_PATH = path.join(__dirname, '.trae/documents/COF 2026-11-01.pdf');

async function main() {
  console.log('='.repeat(80));
  console.log('COF PDF 文本提取测试');
  console.log('='.repeat(80));
  console.log();

  if (!fs.existsSync(PDF_PATH)) {
    console.error(`❌ PDF文件不存在: ${PDF_PATH}`);
    process.exit(1);
  }

  const fileBuffer = fs.readFileSync(PDF_PATH);
  console.log(`📄 文件大小: ${(fileBuffer.length / 1024).toFixed(1)} KB`);
  console.log();

  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(fileBuffer) }).promise;
  console.log(`📖 页数: ${pdf.numPages}`);
  console.log();

  let totalTextLength = 0;
  const allTextItems = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    console.log(`📄 第 ${pageNum} 页:`);
    console.log('-'.repeat(60));

    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.0 });
    console.log(`  页面尺寸: ${viewport.width.toFixed(2)} x ${viewport.height.toFixed(2)} pt`);
    console.log(`  变换矩阵: [${viewport.transform.join(', ')}]`);

    const textContent = await page.getTextContent();
    console.log(`  文本项数: ${textContent.items.length}`);

    const pageText = textContent.items.map(item => item.str).join(' ');
    console.log(`  文本长度: ${pageText.length} 字符`);
    totalTextLength += pageText.length;

    for (const item of textContent.items) {
      if (item.str && item.str.trim().length > 0) {
        allTextItems.push({
          page: pageNum,
          text: item.str,
          x: item.transform[4],
          y: item.transform[5],
          width: item.width || 0,
          height: item.height || 0,
          fontSize: item.height || 0,
        });
      }
    }

    if (pageText.trim().length > 0) {
      console.log(`  文本预览 (前300字符):`);
      console.log(`  ${pageText.substring(0, 300).replace(/\s+/g, ' ').trim()}`);
    } else {
      console.log(`  ⚠️  该页没有文本内容（可能是图片型PDF）`);
    }

    console.log();
  }

  console.log('='.repeat(80));
  console.log(`📊 总文本长度: ${totalTextLength} 字符`);
  console.log(`📊 总文本项数: ${allTextItems.length}`);
  
  const isImageBased = totalTextLength < 100;
  console.log(`📊 PDF类型: ${isImageBased ? '🖼️ 图片型（需要OCR）' : '📝 文本型'}`);
  console.log('='.repeat(80));

  if (!isImageBased) {
    console.log();
    console.log('🔍 搜索日期相关内容:');
    console.log('-'.repeat(60));

    const datePatterns = [
      /\d{1,2}\s+(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[\.,]?\s+\d{4}/gi,
      /(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+\d{4}/gi,
      /\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{4}/g,
      /\d{4}-\d{1,2}-\d{1,2}/g,
    ];

    const fullText = allTextItems.map(i => i.text).join(' ');
    
    for (const pattern of datePatterns) {
      const matches = fullText.match(pattern);
      if (matches) {
        console.log(`  模式 ${pattern}: 找到 ${matches.length} 个匹配`);
        matches.forEach((m, i) => {
          console.log(`    ${i + 1}. ${m}`);
        });
      }
    }

    console.log();
    console.log('🔍 搜索日期关键词:');
    console.log('-'.repeat(60));

    const keywords = ['date', 'issued', 'expiry', 'expires', 'valid', 'until', 'since', 'day of'];
    for (const kw of keywords) {
      const kwItems = allTextItems.filter(item => 
        item.text.toLowerCase().includes(kw.toLowerCase())
      );
      if (kwItems.length > 0) {
        console.log(`  "${kw}": 找到 ${kwItems.length} 个匹配项`);
        kwItems.slice(0, 5).forEach(item => {
          console.log(`    第${item.page}页: "${item.text}" @ (${item.x.toFixed(1)}, ${item.y.toFixed(1)})`);
        });
      }
    }
  }
}

main().catch(err => {
  console.error('测试失败:', err);
  process.exit(1);
});
