import { PDFDocument, rgb } from 'pdf-lib';
import { readFileSync, writeFileSync } from 'fs';

const pdfPath = './.trae/documents/COF 2026-11-01.pdf';
const data = readFileSync(pdfPath);

async function main() {
  const pdfDoc = await PDFDocument.load(data);
  const pages = pdfDoc.getPages();
  const page = pages[0];
  const { width, height } = page.getSize();
  
  console.log(`页面尺寸: ${width} x ${height}`);
  
  // 在已知的文本位置画框 - 先获取文本内容
  // 由于Node.js不能直接用pdfjs-dist，我们用已知的日期位置来测试
  // 假设日期在页面上方某个位置
  
  // 测试1: 在页面左上角画一个框 (PDF坐标系中y应该很大)
  page.drawRectangle({
    x: 50,
    y: height - 100,
    width: 200,
    height: 30,
    borderColor: rgb(1, 0, 0),
    borderWidth: 2,
    color: rgb(1, 0, 0),
    opacity: 0.1,
  });
  console.log('左上角框: x=50, y=' + (height - 100) + ' (应该在页面上方)');
  
  // 测试2: 在页面左下角画一个框 (PDF坐标系中y应该很小)
  page.drawRectangle({
    x: 50,
    y: 50,
    width: 200,
    height: 30,
    borderColor: rgb(0, 0, 1),
    borderWidth: 2,
    color: rgb(0, 0, 1),
    opacity: 0.1,
  });
  console.log('左下角框: x=50, y=50 (应该在页面下方)');
  
  // 测试3: 在页面中间画一个框
  page.drawRectangle({
    x: width / 2 - 100,
    y: height / 2,
    width: 200,
    height: 30,
    borderColor: rgb(0, 1, 0),
    borderWidth: 2,
    color: rgb(0, 1, 0),
    opacity: 0.1,
  });
  console.log('中间框: x=' + (width / 2 - 100) + ', y=' + (height / 2));
  
  const pdfBytes = await pdfDoc.save();
  writeFileSync('./test-annotated.pdf', pdfBytes);
  console.log('\n已保存到 test-annotated.pdf');
  console.log('红色框(左上) -> 应该在页面上方');
  console.log('蓝色框(左下) -> 应该在页面下方');
  console.log('绿色框(中间) -> 应该在页面中间');
}

main().catch(console.error);
