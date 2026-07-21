import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PDF_PATH = path.join(__dirname, '.trae/documents/COF 2026-11-01.pdf');

async function extractImagesFromPage(page) {
  const ops = await page.getOperatorList();
  const images = [];
  
  for (let i = 0; i < ops.argsArray.length; i++) {
    const args = ops.argsArray[i];
    const fn = ops.fnArray[i];
    
    if (fn === 62 || fn === 63) {
      const imgArgs = args[0];
      if (imgArgs && typeof imgArgs === 'object') {
        images.push({
          objId: imgArgs,
          args,
        });
      }
    }
  }
  
  return images;
}

async function main() {
  console.log('='.repeat(80));
  console.log('COF PDF 图像提取测试');
  console.log('='.repeat(80));
  console.log();

  if (!fs.existsSync(PDF_PATH)) {
    console.error(`❌ PDF文件不存在: ${PDF_PATH}`);
    process.exit(1);
  }

  const fileBuffer = fs.readFileSync(PDF_PATH);
  console.log(`📄 文件大小: ${(fileBuffer.length / 1024).toFixed(1)} KB`);
  console.log();

  const pdf = await pdfjsLib.getDocument({ 
    data: new Uint8Array(fileBuffer),
    disableFontFace: true,
  }).promise;
  console.log(`📖 页数: ${pdf.numPages}`);
  console.log();

  for (let pageNum = 1; pageNum <= Math.min(pdf.numPages, 3); pageNum++) {
    console.log(`📄 第 ${pageNum} 页:`);
    console.log('-'.repeat(60));
    
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1 });
    console.log(`  页面尺寸: ${viewport.width.toFixed(2)} x ${viewport.height.toFixed(2)} pt`);
    
    const images = await extractImagesFromPage(page);
    console.log(`  找到 ${images.length} 个图像操作`);
    
    if (images.length > 0) {
      const firstImg = images[0];
      console.log(`  第一个图像对象:`, Object.keys(firstImg.objId));
    }
    
    console.log();
  }

  console.log('尝试直接测试OCR：使用Tesseract加载PDF...');
  
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng');
  
  try {
    console.log('  直接用Tesseract识别PDF...');
    const result = await worker.recognize(new Uint8Array(fileBuffer));
    console.log(`  识别文本长度: ${result.data.text.length}`);
    console.log(`  前500字符:`);
    console.log(result.data.text.substring(0, 500));
  } catch (e) {
    console.log(`  Tesseract直接识别PDF失败: ${e.message}`);
    console.log('  尝试用pdf-poppler或其他方式...');
  }
  
  await worker.terminate();
}

main().catch(err => {
  console.error('测试失败:', err);
  process.exit(1);
});
