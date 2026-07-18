/**
 * PDF兼容性和速度测试脚本
 * 测试内容：
 * 1. PDF解析速度（文本型vs图片型）
 * 2. OCR识别速度
 * 3. 日期识别准确性
 * 4. 证书类型检测
 * 5. PDF标注速度
 * 6. PDF合并速度
 */

import * as fs from 'fs';
import * as path from 'path';

// 测试文件路径
const TEST_DIR = '.trae/documents';
const TEST_PDFS = [
  '2.船舶证书-古弗尼尔.pdf',
  '2.船舶证书（航海家）.pdf',
  'COF 2026-11-01.pdf',
];

// 性能指标
interface PerformanceMetrics {
  fileName: string;
  fileSizeKB: number;
  pageCount: number;
  isImageBased: boolean;
  parseTimeMs: number;
  ocrTimeMs: number;
  dateRecognitionTimeMs: number;
  dateCount: number;
  certType: string;
  annotateTimeMs: number;
  mergeTimeMs: number;
  success: boolean;
  error?: string;
}

async function runTests() {
  console.log('='.repeat(80));
  console.log('船舶证书PDF识别系统 - 兼容性和速度测试');
  console.log('='.repeat(80));
  console.log();

  const results: PerformanceMetrics[] = [];

  for (const pdfName of TEST_PDFS) {
    const pdfPath = path.join(TEST_DIR, pdfName);
    if (!fs.existsSync(pdfPath)) {
      console.log(`❌ 测试文件不存在: ${pdfPath}`);
      continue;
    }

    console.log(`📄 测试文件: ${pdfName}`);
    console.log('-'.repeat(60));

    const result: PerformanceMetrics = {
      fileName: pdfName,
      fileSizeKB: 0,
      pageCount: 0,
      isImageBased: false,
      parseTimeMs: 0,
      ocrTimeMs: 0,
      dateRecognitionTimeMs: 0,
      dateCount: 0,
      certType: '',
      annotateTimeMs: 0,
      mergeTimeMs: 0,
      success: true,
    };

    try {
      // 读取文件
      const fileBuffer = fs.readFileSync(pdfPath);
      result.fileSizeKB = Math.round(fileBuffer.length / 1024);
      console.log(`文件大小: ${result.fileSizeKB} KB`);

      // 1. PDF解析测试
      console.log('');
      console.log('1️⃣ PDF解析测试...');
      const parseStart = Date.now();
      
      const { parsePdf, getPdfPageCount } = await import('./src/utils/pdfParser');
      const pageCount = await getPdfPageCount(fileBuffer.buffer.slice(fileBuffer.byteOffset, fileBuffer.byteOffset + fileBuffer.length));
      result.pageCount = pageCount;
      
      const parseResult = await parsePdf(fileBuffer.buffer.slice(fileBuffer.byteOffset, fileBuffer.byteOffset + fileBuffer.length));
      result.isImageBased = parseResult.isImageBased;
      result.parseTimeMs = Date.now() - parseStart;
      
      console.log(`页数: ${pageCount}`);
      console.log(`是否图片型: ${result.isImageBased ? '是（需要OCR）' : '否（文本型）'}`);
      console.log(`解析耗时: ${result.parseTimeMs} ms`);

      // 2. OCR测试（仅图片型PDF）
      console.log('');
      console.log('2️⃣ OCR识别测试...');
      if (result.isImageBased) {
        const ocrStart = Date.now();
        const { ocrFullPdf } = await import('./src/utils/ocr');
        
        await ocrFullPdf(
          fileBuffer.buffer.slice(fileBuffer.byteOffset, fileBuffer.byteOffset + fileBuffer.length),
          pageCount,
          (page, total) => {
            console.log(`  OCR进度: ${page}/${total}`);
          }
        );
        
        result.ocrTimeMs = Date.now() - ocrStart;
        console.log(`OCR耗时: ${result.ocrTimeMs} ms`);
      } else {
        console.log('跳过（非图片型PDF）');
      }

      // 3. 日期识别测试
      console.log('');
      console.log('3️⃣ 日期识别测试...');
      const dateStart = Date.now();
      const { recognizeDatesFromText, recognizeDatesFromOcr } = await import('./src/utils/dateRecognizer');
      const { OcrResult } = await import('./src/utils/ocr');
      
      let dates;
      if (result.isImageBased) {
        const { ocrFullPdf } = await import('./src/utils/ocr');
        const ocrResults = await ocrFullPdf(
          fileBuffer.buffer.slice(fileBuffer.byteOffset, fileBuffer.byteOffset + fileBuffer.length),
          pageCount
        );
        dates = recognizeDatesFromOcr(ocrResults);
      } else {
        dates = recognizeDatesFromText(parseResult.textItems, parseResult.textContent);
      }
      
      result.dateCount = dates.length;
      result.dateRecognitionTimeMs = Date.now() - dateStart;
      
      console.log(`识别到日期数: ${dates.length}`);
      dates.forEach((d, i) => {
        console.log(`  ${i + 1}. ${d.type}: ${d.date} (置信度: ${Math.round(d.confidence * 100)}%)`);
      });
      console.log(`日期识别耗时: ${result.dateRecognitionTimeMs} ms`);

      // 4. 证书类型检测
      console.log('');
      console.log('4️⃣ 证书类型检测...');
      const { detectCertType } = await import('./src/store/certStore');
      const { CERT_TYPE_INFO } = await import('./src/types');
      
      result.certType = detectCertType(pdfName, parseResult.textContent);
      const certInfo = CERT_TYPE_INFO[result.certType];
      console.log(`检测到证书类型: ${result.certType} (${certInfo.code}-${certInfo.label})`);

      // 5. PDF标注测试
      console.log('');
      console.log('5️⃣ PDF标注测试...');
      const annotateStart = Date.now();
      const { annotatePdf } = await import('./src/utils/pdfAnnotator');
      
      if (dates.length > 0) {
        await annotatePdf(
          fileBuffer.buffer.slice(fileBuffer.byteOffset, fileBuffer.byteOffset + fileBuffer.length),
          dates
        );
        result.annotateTimeMs = Date.now() - annotateStart;
        console.log(`标注耗时: ${result.annotateTimeMs} ms`);
      } else {
        console.log('跳过（无日期需要标注）');
      }

      console.log('');
      console.log('✅ 测试完成');

    } catch (error) {
      console.log('');
      console.log(`❌ 测试失败: ${error instanceof Error ? error.message : String(error)}`);
      result.success = false;
      result.error = error instanceof Error ? error.message : String(error);
    }

    results.push(result);
    console.log();
  }

  // 汇总报告
  console.log('='.repeat(80));
  console.log('测试汇总报告');
  console.log('='.repeat(80));
  console.log();

  console.table(results.map(r => ({
    '文件名': r.fileName,
    '大小(KB)': r.fileSizeKB,
    '页数': r.pageCount,
    '图片型': r.isImageBased ? '是' : '否',
    '解析(ms)': r.parseTimeMs,
    'OCR(ms)': r.ocrTimeMs || '-',
    '日期识别(ms)': r.dateRecognitionTimeMs,
    '日期数': r.dateCount,
    '证书类型': r.certType,
    '标注(ms)': r.annotateTimeMs || '-',
    '状态': r.success ? '✅' : '❌',
  })));

  console.log();
  console.log('📊 性能分析:');
  const avgParse = results.filter(r => r.success).reduce((sum, r) => sum + r.parseTimeMs, 0) / results.filter(r => r.success).length;
  const avgOcr = results.filter(r => r.success && r.isImageBased).reduce((sum, r) => sum + r.ocrTimeMs, 0) / results.filter(r => r.success && r.isImageBased).length;
  const avgDate = results.filter(r => r.success).reduce((sum, r) => sum + r.dateRecognitionTimeMs, 0) / results.filter(r => r.success).length;
  
  console.log(`平均解析时间: ${Math.round(avgParse)} ms`);
  console.log(`平均OCR时间: ${results.filter(r => r.success && r.isImageBased).length > 0 ? Math.round(avgOcr) + ' ms' : 'N/A'}`);
  console.log(`平均日期识别时间: ${Math.round(avgDate)} ms`);
  console.log(`日期识别成功率: ${results.filter(r => r.success && r.dateCount > 0).length}/${results.filter(r => r.success).length}`);
}

runTests().catch(console.error);
