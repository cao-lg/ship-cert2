import { readFileSync } from 'fs';
import * as pdfjsLib from 'pdfjs-dist';
import { createCanvas } from 'canvas';
import { createWorker } from 'tesseract.js';
import { buildLines, findDateGroups, recognizeDatesFromUnified } from './src/utils/dateRecognizer';
import { DATE_TYPE_INFO } from './src/types';
import { normSp } from './src/utils/textUtils';

global.ImageData = createCanvas(1, 1).constructor.ImageData;
global.Image = createCanvas(1, 1).constructor.Image;

const PDF_PATH = '/workspace/.trae/documents/ISSC 2028-05-12.pdf';

async function main() {
  console.log('=== ISSC PDF 详细调试 v2 ===\n');

  const data = readFileSync(PDF_PATH);
  const buffer = new Uint8Array(data).buffer;
  
  console.log('1. 解析PDF（文本提取）...');
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const page = await pdf.getPage(1);
  const textContent = await page.getTextContent();
  
  console.log('\n文本提取结果:');
  const lines: string[] = [];
  let currentLine = '';
  let lastY = null;
  
  for (const item of textContent.items as Array<{ str: string; transform: number[]; width?: number }>) {
    const y = item.transform[5];
    if (lastY !== null && Math.abs(y - lastY) > 5) {
      if (currentLine.trim()) lines.push(currentLine.trim());
      currentLine = '';
    }
    currentLine += item.str + ' ';
    lastY = y;
  }
  if (currentLine.trim()) lines.push(currentLine.trim());
  
  for (let i = 0; i < lines.length; i++) {
    console.log(`  [${i}] ${lines[i]}`);
    if (lines[i].toLowerCase().includes('valid until')) {
      console.log(`      *** FOUND VALID UNTIL ***`);
    }
    if (lines[i].toLowerCase().includes('date of')) {
      console.log(`      *** FOUND DATE OF ***`);
    }
  }

  console.log('\n2. 构建统一格式items...');
  const unifiedItems: Array<{ str: string; x0: number; y: number; width: number; height: number; page: number }> = [];
  
  for (const item of textContent.items as Array<{ str: string; transform: number[]; width?: number; height?: number }>) {
    const x = item.transform[4];
    const y = item.transform[5];
    const width = item.width || 0;
    const height = item.height || 10;
    
    unifiedItems.push({
      str: item.str,
      x0: x,
      y: y,
      width: width,
      height: height,
      page: 1,
    });
  }
  
  console.log(`   共 ${unifiedItems.length} 个文本项`);

  console.log('\n3. 构建行...');
  const { lines: builtLines } = buildLines(unifiedItems);
  
  console.log(`   总行数: ${builtLines.length}`);
  
  console.log('\n   包含日期的行:');
  for (let i = 0; i < builtLines.length; i++) {
    if (builtLines[i].text.match(/\d{4}/)) {
      console.log(`   [${i}] "${builtLines[i].text}"`);
      console.log(`       yTop=${builtLines[i].items[0]?.y.toFixed(1)}`);
    }
  }

  console.log('\n   包含关键词的行:');
  for (const [dateType, info] of Object.entries(DATE_TYPE_INFO)) {
    console.log(`   --- ${dateType} ---`);
    for (let i = 0; i < builtLines.length; i++) {
      const lineNorm = normSp(builtLines[i].text);
      for (const kw of info.keywords) {
        const kwNorm = normSp(kw);
        if (lineNorm.includes(kwNorm)) {
          console.log(`   [${i}] "${builtLines[i].text}" 匹配关键词: "${kw}"`);
        }
      }
    }
  }

  console.log('\n4. 逐行查找日期:');
  for (let i = 0; i < builtLines.length; i++) {
    const dgs = findDateGroups(builtLines[i].items);
    if (dgs.length > 0) {
      console.log(`   行${i}: 找到 ${dgs.length} 个日期:`);
      for (const dg of dgs) {
        console.log(`      ${dg.iso} (x0=${dg.x0.toFixed(0)}, x1=${dg.x1.toFixed(0)}, yTop=${dg.yTop.toFixed(0)}, yBot=${dg.yBot.toFixed(0)})`);
      }
    }
  }

  console.log('\n5. 检查行37的token拆分:');
  const line37 = builtLines[37];
  if (line37) {
    console.log(`   行37文本: "${line37.text}"`);
    console.log(`   token列表:`);
    for (const item of line37.items) {
      console.log(`      "${item.str}" (x0=${item.x0.toFixed(1)}, y=${item.y.toFixed(1)}, width=${item.width.toFixed(1)})`);
    }
  }

  console.log('\n5. 识别日期类型（详细日志）:');
  const dates = recognizeDatesFromUnified(unifiedItems, 0.85);
  
  console.log(`\n识别到 ${dates.length} 个日期:`);
  for (const d of dates) {
    console.log(`   类型: ${d.type}, 日期: ${d.date}, 置信度: ${(d.confidence*100).toFixed(0)}%`);
    console.log(`         位置: x=${d.position.x.toFixed(0)}, y=${d.position.y.toFixed(0)}, w=${d.position.width.toFixed(0)}, h=${d.position.height.toFixed(0)}`);
  }

  console.log('\n6. 检查"valid until"和日期的位置关系:');
  let validUntilLine = -1;
  let may12Line = -1;
  
  for (let i = 0; i < builtLines.length; i++) {
    if (builtLines[i].text.toLowerCase().includes('valid until')) {
      validUntilLine = i;
    }
    if (builtLines[i].text.includes('May') && builtLines[i].text.includes('2028')) {
      may12Line = i;
    }
  }
  
  console.log(`   "valid until" 在行 ${validUntilLine}`);
  console.log(`   "May 2028" 在行 ${may12Line}`);
  if (validUntilLine >= 0) {
    console.log(`   valid until 行内容: "${builtLines[validUntilLine].text}"`);
  }
  if (may12Line >= 0) {
    console.log(`   May 2028 行内容: "${builtLines[may12Line].text}"`);
  }

  console.log('\n=== 调试完成 ===');
}

main().catch(console.error);
