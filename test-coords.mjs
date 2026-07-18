// 模拟OCR坐标转换验证
// 假设页面高度 842.4pt (A4纸)
const pageHeight = 842.4;
const scale = 2.0;

// 假设Canvas上有一个日期，在页面上方
// Canvas坐标（左上角原点，y向下）
// 文字顶部在Canvas y = 100 (即页面上方100像素处)
// 文字底部在Canvas y = 130
const canvasY0 = 100; // 顶部
const canvasY1 = 130; // 底部

console.log('=== Canvas坐标 (左上角原点, y向下) ===');
console.log(`文字顶部 (y0): ${canvasY0}px = ${canvasY0/scale}pt`);
console.log(`文字底部 (y1): ${canvasY1}px = ${canvasY1/scale}pt`);

// 转换为PDF坐标（左下角原点，y向上）
const pdfBottom = pageHeight - canvasY1 / scale;  // 文字底部
const pdfTop = pageHeight - canvasY0 / scale;     // 文字顶部

console.log('\n=== 转换为PDF坐标 (左下角原点, y向上) ===');
console.log(`文字底部 (y0): ${pdfBottom}pt`);
console.log(`文字顶部 (y1): ${pdfTop}pt`);
console.log(`验证: 顶部 > 底部 ? ${pdfTop > pdfBottom} (应该为true)`);

// 矩形绘制参数 (pdf-lib drawRectangle)
// x: 左边x, y: 底部y, width: 宽度, height: 高度
const rectY = pdfBottom;
const rectHeight = pdfTop - pdfBottom;

console.log('\n=== pdf-lib drawRectangle 参数 ===');
console.log(`x: 100, y: ${rectY}, width: 200, height: ${rectHeight}`);
console.log(`y应该接近页面顶部 (${pageHeight}), 实际值: ${rectY}`);
console.log(`y值大 = 页面上方, y值小 = 页面下方`);

console.log('\n=== 验证 ===');
console.log(`如果y=${rectY}接近${pageHeight}，说明在页面上方 ✓`);
console.log(`如果y接近0，说明在页面下方 ✗`);

// 常见错误：y0和y1搞反
const wrongBottom = pageHeight - canvasY0 / scale;
const wrongTop = pageHeight - canvasY1 / scale;
console.log('\n=== 错误的转换（y0/y1搞反） ===');
console.log(`底部: ${wrongBottom}, 顶部: ${wrongTop}`);
console.log(`顶部 > 底部 ? ${wrongTop > wrongBottom} (应该为false，说明反了)`);
